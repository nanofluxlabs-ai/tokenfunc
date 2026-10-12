package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// channel_daily_dim_usages 历史回填：从 logs 按自然日（计费时区）「删后重建」，只处理已完结的自然日。
//
// 为什么只补完结日：热路径按记账时刻写当天的行，已完结日不会再有新增（批量 flush 最多延迟 30s，
// 这里再留 channelDimBackfillSettleSeconds 余量），整天重建既幂等又不会与热路径双计。
// 上线当天热路径只覆盖了部署之后的时段，次日起对它跑一次回填即可把整天补齐。
//
// 读 logs 按 (created_at, id) keyset 分页走 idx_created_at_id，单批 channelDimBackfillBatch 行、批间停顿，
// 避免大表上的单条大扫描。官方价值口径与热路径一致：quota / other.group_ratio。

const (
	channelDimBackfillBatch         = 5000
	channelDimBackfillPause         = 150 * time.Millisecond
	channelDimBackfillSettleSeconds = 600
	channelDimBackfillMaxDays       = 92
	channelDimBackfillTimeout       = 6 * time.Hour
)

// ChannelDimBackfillStatus 回填任务状态（进程内，最近一次）
type ChannelDimBackfillStatus struct {
	Running     bool     `json:"running"`
	StartDate   string   `json:"start_date"`
	EndDate     string   `json:"end_date"`
	DaysTotal   int      `json:"days_total"`
	DaysDone    int      `json:"days_done"`
	CurrentDay  string   `json:"current_day,omitempty"`
	SkippedDays []string `json:"skipped_days,omitempty"`
	LogsScanned int64    `json:"logs_scanned"`
	RowsWritten int64    `json:"rows_written"`
	StartedAt   int64    `json:"started_at"`
	FinishedAt  int64    `json:"finished_at"`
	Error       string   `json:"error,omitempty"`
}

var (
	channelDimBackfillRunning atomic.Bool
	channelDimBackfillMu      sync.Mutex
	channelDimBackfillState   ChannelDimBackfillStatus
)

// GetChannelDimBackfillStatus 返回本进程最近一次回填的状态快照
func GetChannelDimBackfillStatus() ChannelDimBackfillStatus {
	channelDimBackfillMu.Lock()
	defer channelDimBackfillMu.Unlock()
	s := channelDimBackfillState
	s.SkippedDays = append([]string(nil), s.SkippedDays...)
	return s
}

func updateChannelDimBackfillState(fn func(s *ChannelDimBackfillStatus)) {
	channelDimBackfillMu.Lock()
	fn(&channelDimBackfillState)
	channelDimBackfillMu.Unlock()
}

// StartChannelDimUsageBackfill 校验区间后在后台 goroutine 执行回填，立即返回初始状态。
// 同一进程同时只允许一个回填任务；区间为自然日闭区间，跨度上限 channelDimBackfillMaxDays 天。
func StartChannelDimUsageBackfill(startDate string, endDate string) (ChannelDimBackfillStatus, error) {
	r, err := ResolveChannelUsageDayRange(startDate, endDate, channelDimBackfillMaxDays)
	if err != nil {
		return ChannelDimBackfillStatus{}, err
	}
	if !channelDimBackfillRunning.CompareAndSwap(false, true) {
		return GetChannelDimBackfillStatus(), fmt.Errorf("已有回填任务在执行")
	}
	status := ChannelDimBackfillStatus{
		Running:   true,
		StartDate: model.ChannelUsageDayString(r.Start),
		EndDate:   model.ChannelUsageDayString(r.EndExcl - 86400),
		DaysTotal: int((r.EndExcl - r.Start) / 86400),
		StartedAt: time.Now().Unix(),
	}
	updateChannelDimBackfillState(func(s *ChannelDimBackfillStatus) { *s = status })

	go func() {
		defer channelDimBackfillRunning.Store(false)
		ctx, cancel := context.WithTimeout(context.Background(), channelDimBackfillTimeout)
		defer cancel()
		err := runChannelDimUsageBackfill(ctx, r.Start, r.EndExcl)
		updateChannelDimBackfillState(func(s *ChannelDimBackfillStatus) {
			s.Running = false
			s.CurrentDay = ""
			s.FinishedAt = time.Now().Unix()
			if err != nil {
				s.Error = err.Error()
			}
		})
		final := GetChannelDimBackfillStatus()
		if err != nil {
			common.SysError(fmt.Sprintf("channel dim usage backfill failed: %s~%s done=%d/%d logs=%d rows=%d err=%v",
				final.StartDate, final.EndDate, final.DaysDone, final.DaysTotal, final.LogsScanned, final.RowsWritten, err))
			return
		}
		common.SysLog(fmt.Sprintf("channel dim usage backfill done: %s~%s days=%d skipped=%v logs=%d rows=%d",
			final.StartDate, final.EndDate, final.DaysDone, final.SkippedDays, final.LogsScanned, final.RowsWritten))
	}()
	return status, nil
}

func runChannelDimUsageBackfill(ctx context.Context, startTS int64, endExclusive int64) error {
	if model.DB == nil || model.LOG_DB == nil {
		return fmt.Errorf("db not initialized")
	}
	settledBefore := time.Now().Unix() - channelDimBackfillSettleSeconds
	for dayStart := startTS; dayStart < endExclusive; dayStart += 86400 {
		day := model.ChannelUsageDayString(dayStart)
		if dayStart+86400 > settledBefore {
			// 今天或刚结束不足 10 分钟的日子：热路径仍在写，跳过
			updateChannelDimBackfillState(func(s *ChannelDimBackfillStatus) { s.SkippedDays = append(s.SkippedDays, day) })
			continue
		}
		updateChannelDimBackfillState(func(s *ChannelDimBackfillStatus) { s.CurrentDay = day })
		scanned, rows, err := BackfillChannelDimUsageDay(ctx, dayStart)
		updateChannelDimBackfillState(func(s *ChannelDimBackfillStatus) {
			s.LogsScanned += scanned
			s.RowsWritten += int64(rows)
			if err == nil {
				s.DaysDone++
			}
		})
		if err != nil {
			return fmt.Errorf("day %s: %w", day, err)
		}
		common.SysLog(fmt.Sprintf("channel dim usage backfill: day=%s logs=%d rows=%d", day, scanned, rows))
	}
	return nil
}

type channelDimBackfillLog struct {
	Id               int    `gorm:"column:id"`
	CreatedAt        int64  `gorm:"column:created_at"`
	ChannelId        int    `gorm:"column:channel_id"`
	UserId           int    `gorm:"column:user_id"`
	ModelName        string `gorm:"column:model_name"`
	Quota            int    `gorm:"column:quota"`
	PromptTokens     int    `gorm:"column:prompt_tokens"`
	CompletionTokens int    `gorm:"column:completion_tokens"`
	Other            string `gorm:"column:other"`
}

type channelDimBackfillKey struct {
	channelId int
	userId    int
	modelName string
}

// BackfillChannelDimUsageDay 重建单个自然日（dayStart 为计费时区零点）的明细行，返回扫描日志数与写入行数。
func BackfillChannelDimUsageDay(ctx context.Context, dayStart int64) (int64, int, error) {
	dayEnd := dayStart + 86400
	aggs := make(map[channelDimBackfillKey]*model.ChannelDailyDimUsage)
	var scanned int64
	lastTs, lastId := dayStart, 0
	for {
		if err := ctx.Err(); err != nil {
			return scanned, 0, err
		}
		var batch []channelDimBackfillLog
		err := model.LOG_DB.Table("logs").
			Select("id, created_at, channel_id, user_id, model_name, quota, prompt_tokens, completion_tokens, other").
			Where("created_at >= ? AND created_at < ?", lastTs, dayEnd).
			Where("(created_at > ? OR id > ?)", lastTs, lastId).
			Where("type = ? AND channel_id > 0", model.LogTypeConsume).
			Order("created_at ASC, id ASC").
			Limit(channelDimBackfillBatch).
			Scan(&batch).Error
		if err != nil {
			return scanned, 0, fmt.Errorf("scan logs after (%d,%d): %w", lastTs, lastId, err)
		}
		for _, l := range batch {
			scanned++
			officialQuota := model.ComputeOfficialQuota(l.Quota, model.GroupRatioFromLogOtherJSON(l.Other))
			key := channelDimBackfillKey{channelId: l.ChannelId, userId: l.UserId, modelName: model.NormalizeChannelDimModelName(l.ModelName)}
			agg := aggs[key]
			if agg == nil {
				agg = &model.ChannelDailyDimUsage{ChannelId: key.channelId, DayStart: dayStart, UserId: key.userId, ModelName: key.modelName}
				aggs[key] = agg
			}
			agg.Quota += int64(l.Quota)
			agg.OfficialQuota += officialQuota
			agg.PromptTokens += int64(l.PromptTokens)
			agg.CompletionTokens += int64(l.CompletionTokens)
			agg.CallCount++
		}
		if len(batch) < channelDimBackfillBatch {
			break
		}
		last := batch[len(batch)-1]
		lastTs, lastId = last.CreatedAt, last.Id
		select {
		case <-ctx.Done():
			return scanned, 0, ctx.Err()
		case <-time.After(channelDimBackfillPause):
		}
	}
	rows := make([]model.ChannelDailyDimUsage, 0, len(aggs))
	for _, agg := range aggs {
		rows = append(rows, *agg)
	}
	if err := model.ReplaceChannelDimUsageDay(dayStart, rows); err != nil {
		return scanned, 0, err
	}
	return scanned, len(rows), nil
}

// ResolveChannelUsageDayRange 解析渠道消耗相关接口的 start_date / end_date（YYYY-MM-DD，计费时区自然日闭区间）。
// 两端都为空 = 今天；只给一端则另一端与之相同。maxDays>0 时限制跨度（含首尾）。
func ResolveChannelUsageDayRange(startDate string, endDate string, maxDays int) (model.FinanceRange, error) {
	if startDate == "" && endDate == "" {
		startDate = model.FinanceToday()
		endDate = startDate
	}
	if startDate == "" {
		startDate = endDate
	}
	if endDate == "" {
		endDate = startDate
	}
	r, err := model.ParseFinanceDayRange(startDate, endDate)
	if err != nil {
		return model.FinanceRange{}, err
	}
	if maxDays > 0 {
		if err := r.CheckMaxDays(maxDays); err != nil {
			return model.FinanceRange{}, err
		}
	}
	return r, nil
}
