package service

import (
	"context"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 渠道消耗小时桶 + 累计的全量回填：用 logs 重建 channel_hourly_usages 与 channel_usage_totals。
// 首次部署自动跑一次（options 标志位幂等），之后只由 Root 手动触发。

const (
	channelUsageBackfillChunkDays = 30
	channelUsageBackfillBatchSize = 5000
	// channelUsageBackfillDoneKey 幂等标志：完成一次后写进 options，重启不会重复扫描；
	// 删掉这一行可强制重跑（如官方价口径调整后）。
	channelUsageBackfillDoneKey = "channel_usage_backfilled_v1"
)

var channelUsageBackfillRunning atomic.Bool

// StartChannelUsageBackfillIfNeeded 启动时在后台检查标志位，未完成则跑一次全量回填（不阻塞启动）
func StartChannelUsageBackfillIfNeeded() {
	go func() {
		if !channelUsageBackfillRunning.CompareAndSwap(false, true) {
			return
		}
		defer channelUsageBackfillRunning.Store(false)
		if model.DB == nil || model.LOG_DB == nil {
			common.SysError("channel usage backfill: DB not ready, skipping")
			return
		}
		var flag model.Option
		result := model.DB.Where(&model.Option{Key: channelUsageBackfillDoneKey}).Limit(1).Find(&flag)
		if result.Error == nil && result.RowsAffected > 0 && flag.Value == "true" {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		report, err := BackfillChannelUsage(ctx)
		if err != nil {
			common.SysError(fmt.Sprintf("channel usage backfill auto-run failed (channels=%d hourly=%d logs=%d): %v",
				report.ChannelsUpdated, report.HourlyRowsUpsert, report.LogsScanned, err))
			return
		}
		if err := model.UpdateOption(channelUsageBackfillDoneKey, "true"); err != nil {
			common.SysError(fmt.Sprintf("channel usage backfill: persist done flag failed: %v", err))
		}
	}()
}

// ChannelUsageBackfillReport 回填结果
type ChannelUsageBackfillReport struct {
	ChannelsUpdated  int   `json:"channels_updated"`
	HourlyRowsUpsert int64 `json:"hourly_rows_upserted"`
	LogsScanned      int64 `json:"logs_scanned"`
	OldestLogTs      int64 `json:"oldest_log_ts"`
	NewestLogTs      int64 `json:"newest_log_ts"`
	DurationSeconds  int64 `json:"duration_seconds"`
}

type channelUsageBucket struct {
	Quota            int64
	OfficialQuota    int64
	PromptTokens     int64
	CompletionTokens int64
	CallCount        int64
}

type channelUsageBucketKey struct {
	ChannelId int
	HourStart int64
}

type channelUsageBackfillLog struct {
	Id               int    `gorm:"column:id"`
	ChannelId        int    `gorm:"column:channel_id"`
	CreatedAt        int64  `gorm:"column:created_at"`
	Quota            int    `gorm:"column:quota"`
	PromptTokens     int    `gorm:"column:prompt_tokens"`
	CompletionTokens int    `gorm:"column:completion_tokens"`
	Other            string `gorm:"column:other"`
}

// BackfillChannelUsage 用 logs 全量重建 channel_hourly_usages 与 channel_usage_totals：
//  1. 清空两张表（保证可重入）
//  2. 按 30 天窗口、id 游标流式扫 logs，每条用 other.group_ratio 算 official_quota
//  3. 内存按 (channel_id, hour) 分桶累加，每个窗口一次性 upsert；累计最后整表写入
//
// 不动 channels.used_quota（由上游 UpdateChannelUsedQuota 维护，是计费权威）。
// 同步执行、热路径仍在累加：回填期间 flush 进来的增量会叠加在重建结果之上，
// 与 tokensolo 一致，属可接受的秒级误差。
func BackfillChannelUsage(ctx context.Context) (ChannelUsageBackfillReport, error) {
	startedAt := time.Now()
	report := ChannelUsageBackfillReport{}
	if model.DB == nil || model.LOG_DB == nil {
		return report, fmt.Errorf("db not initialized")
	}
	common.SysLog("channel usage backfill: started")

	if err := model.DB.Where("1 = 1").Delete(&model.ChannelHourlyUsage{}).Error; err != nil {
		return report, fmt.Errorf("clear channel_hourly_usages: %w", err)
	}
	if err := model.ReplaceChannelUsageTotals(nil); err != nil {
		return report, err
	}

	var bounds struct {
		MinTs int64
		MaxTs int64
	}
	err := model.LOG_DB.Raw(
		"SELECT COALESCE(MIN(created_at), 0) AS min_ts, COALESCE(MAX(created_at), 0) AS max_ts FROM logs WHERE type = ? AND channel_id > 0",
		model.LogTypeConsume,
	).Scan(&bounds).Error
	if err != nil {
		return report, fmt.Errorf("query log bounds: %w", err)
	}
	report.OldestLogTs = bounds.MinTs
	report.NewestLogTs = bounds.MaxTs
	if bounds.MinTs == 0 || bounds.MaxTs == 0 {
		common.SysLog("channel usage backfill: no consume logs found, only reset done")
		report.DurationSeconds = int64(time.Since(startedAt).Seconds())
		return report, nil
	}

	channelTotals := make(map[int]*channelUsageBucket)
	chunkSize := int64(channelUsageBackfillChunkDays * 24 * 3600)
	for windowStart := model.AlignToHour(bounds.MinTs); windowStart <= bounds.MaxTs; windowStart += chunkSize {
		if err := ctx.Err(); err != nil {
			return report, err
		}
		windowEnd := windowStart + chunkSize
		buckets := make(map[channelUsageBucketKey]*channelUsageBucket)
		lastID := 0
		for {
			if err := ctx.Err(); err != nil {
				return report, err
			}
			var batch []channelUsageBackfillLog
			err := model.LOG_DB.Table("logs").
				Select("id, channel_id, created_at, quota, prompt_tokens, completion_tokens, other").
				Where("type = ? AND channel_id > 0 AND created_at >= ? AND created_at < ? AND id > ?",
					model.LogTypeConsume, windowStart, windowEnd, lastID).
				Order("id ASC").
				Limit(channelUsageBackfillBatchSize).
				Scan(&batch).Error
			if err != nil {
				return report, fmt.Errorf("scan logs window [%d,%d) lastID=%d: %w", windowStart, windowEnd, lastID, err)
			}
			if len(batch) == 0 {
				break
			}
			for _, l := range batch {
				lastID = l.Id
				report.LogsScanned++
				officialQuota := model.ComputeOfficialQuota(l.Quota, model.GroupRatioFromLogOtherJSON(l.Other))
				k := channelUsageBucketKey{ChannelId: l.ChannelId, HourStart: model.AlignToHour(l.CreatedAt)}
				agg := buckets[k]
				if agg == nil {
					agg = &channelUsageBucket{}
					buckets[k] = agg
				}
				agg.Quota += int64(l.Quota)
				agg.OfficialQuota += officialQuota
				agg.PromptTokens += int64(l.PromptTokens)
				agg.CompletionTokens += int64(l.CompletionTokens)
				agg.CallCount++
				total := channelTotals[l.ChannelId]
				if total == nil {
					total = &channelUsageBucket{}
					channelTotals[l.ChannelId] = total
				}
				total.OfficialQuota += officialQuota
				total.PromptTokens += int64(l.PromptTokens)
				total.CompletionTokens += int64(l.CompletionTokens)
				total.CallCount++
			}
			if len(batch) < channelUsageBackfillBatchSize {
				break
			}
		}
		if len(buckets) == 0 {
			continue
		}
		hourlyRows := make([]model.ChannelHourlyUsage, 0, len(buckets))
		for k, v := range buckets {
			hourlyRows = append(hourlyRows, model.ChannelHourlyUsage{
				ChannelId: k.ChannelId, HourStart: k.HourStart, Quota: v.Quota, OfficialQuota: v.OfficialQuota,
				PromptTokens: v.PromptTokens, CompletionTokens: v.CompletionTokens, CallCount: v.CallCount,
			})
		}
		if err := bulkUpsertChannelHourlyUsage(model.DB, hourlyRows); err != nil {
			return report, fmt.Errorf("upsert hourly window [%d,%d): %w", windowStart, windowEnd, err)
		}
		report.HourlyRowsUpsert += int64(len(hourlyRows))
		common.SysLog(fmt.Sprintf("channel usage backfill: window=[%d,%d) buckets=%d logs_so_far=%d",
			windowStart, windowEnd, len(hourlyRows), report.LogsScanned))
	}

	totals := make([]model.ChannelUsageTotal, 0, len(channelTotals))
	now := common.GetTimestamp()
	for channelId, t := range channelTotals {
		totals = append(totals, model.ChannelUsageTotal{
			ChannelId: channelId, OfficialQuota: t.OfficialQuota, PromptTokens: t.PromptTokens,
			CompletionTokens: t.CompletionTokens, CallCount: t.CallCount, UpdatedAt: now,
		})
	}
	if err := model.ReplaceChannelUsageTotals(totals); err != nil {
		return report, err
	}
	report.ChannelsUpdated = len(totals)
	report.DurationSeconds = int64(time.Since(startedAt).Seconds())
	common.SysLog(fmt.Sprintf("channel usage backfill: done channels=%d hourly_rows=%d logs=%d duration=%ds",
		report.ChannelsUpdated, report.HourlyRowsUpsert, report.LogsScanned, report.DurationSeconds))
	return report, nil
}

// bulkUpsertChannelHourlyUsage 回填窗口内的小时桶整批覆盖写入（同窗口内键不重复，冲突只会来自热路径的并发 flush）
func bulkUpsertChannelHourlyUsage(db *gorm.DB, rows []model.ChannelHourlyUsage) error {
	const batch = 500
	for i := 0; i < len(rows); i += batch {
		chunk := rows[i:min(i+batch, len(rows))]
		err := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "channel_id"}, {Name: "hour_start"}},
			DoUpdates: clause.AssignmentColumns([]string{"quota", "official_quota", "prompt_tokens", "completion_tokens", "call_count"}),
		}).Create(&chunk).Error
		if err != nil {
			return err
		}
	}
	return nil
}
