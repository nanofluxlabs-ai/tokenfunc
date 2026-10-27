package main

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"gorm.io/gorm"
)

const insertBatch = 1000

// generateUsage 生成流水：logs 边生成边分批写，派生表在内存聚合后一次性写入
func (s *seeder) generateUsage() error {
	perfSince := s.now.Add(-30 * 24 * time.Hour).Unix()
	s.agg = newAggregator(s.loc, perfSince, s.now.Unix())
	buffer := make([]*model.Log, 0, insertBatch)
	var writeErr error
	flush := func() {
		if len(buffer) == 0 || writeErr != nil {
			return
		}
		writeErr = model.LOG_DB.CreateInBatches(buffer, insertBatch).Error
		buffer = buffer[:0]
	}
	generateTraffic(s.plans, s.channelIds, s.start, s.now, s.seed, func(ev requestEvent) {
		s.agg.add(ev)
		buffer = append(buffer, buildLog(ev))
		if len(buffer) >= insertBatch {
			flush()
		}
	})
	flush()
	if writeErr != nil {
		return writeErr
	}
	fmt.Printf("  logs %d 条（其中失败 %d），消耗合计 $%.2f\n", s.agg.logCount, s.agg.errorCount, usd(s.agg.consumeSum))
	return s.writeAggregates()
}

// buildLog 消费 / 错误日志，other 字段与线上写入的公开键一致（财务中心按这些键拆 token 与倍率）
func buildLog(ev requestEvent) *model.Log {
	log := &model.Log{
		UserId: ev.Plan.UserId, Username: ev.Plan.Username, CreatedAt: ev.CreatedAt, TokenName: ev.Stream.TokenName,
		TokenId: ev.Stream.TokenId, ModelName: ev.Model.Name, ChannelId: ev.ChannelId, Group: ev.Plan.Group,
		IsStream: ev.IsStream, UseTime: max(1, (ev.LatencyMs+999)/1000), RequestId: common.NewRequestId(),
	}
	adminInfo := map[string]any{"use_channel": []string{itoa(ev.ChannelId)}}
	if ev.Failed {
		log.Type = model.LogTypeError
		log.Content = "status_code=500, upstream error: upstream returned an error"
		log.Other = mustJSON(map[string]any{
			"admin_info": adminInfo, "error_code": "bad_response_status_code", "error_type": "new_api_error",
			"request_path": ev.Model.RequestPath, "status_code": 500,
		})
		return log
	}
	adminInfo["usage_billing_path"] = "upstream"
	log.Type = model.LogTypeConsume
	log.Quota = ev.Quota
	log.PromptTokens = ev.PromptTokens
	log.CompletionTokens = ev.CompletionTokens
	other := map[string]any{
		"admin_info": adminInfo, "billing_source": ev.Plan.BillingSource, "model_ratio": ev.Model.Ratio, "group_ratio": 1,
		"completion_ratio": ev.Model.CompletionRatio, "model_price": -1, "user_group_ratio": -1, "frt": ev.FrtMs,
		"request_path": ev.Model.RequestPath,
	}
	if ev.Model.CacheRatio > 0 {
		other["cache_ratio"] = ev.Model.CacheRatio
		other["cache_tokens"] = ev.CacheTokens
	}
	log.Other = mustJSON(other)
	return log
}

func mustJSON(v any) string {
	data, err := common.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(data)
}

// writeAggregates 派生表与累计计数：quota_data / ent_usage_daily / perf_metrics / users / tokens / channels / 账期
func (s *seeder) writeAggregates() error {
	quotaRows := make([]*model.QuotaData, 0, len(s.agg.quotaData))
	for _, row := range s.agg.quotaData {
		quotaRows = append(quotaRows, row)
	}
	if err := model.DB.CreateInBatches(quotaRows, insertBatch).Error; err != nil {
		return err
	}
	usageRows := make([]*model.EnterpriseUsageDaily, 0, len(s.agg.entUsage))
	for _, row := range s.agg.entUsage {
		usageRows = append(usageRows, row)
	}
	if err := model.DB.CreateInBatches(usageRows, insertBatch).Error; err != nil {
		return err
	}
	perfRows := make([]*model.PerfMetric, 0, len(s.agg.perf))
	for _, row := range s.agg.perf {
		perfRows = append(perfRows, row)
	}
	if err := model.DB.CreateInBatches(perfRows, insertBatch).Error; err != nil {
		return err
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		for userId, totals := range s.agg.users {
			if err := tx.Model(&model.User{}).Where("id = ?", userId).Updates(map[string]any{
				"used_quota": totals.Quota, "request_count": totals.Requests,
			}).Error; err != nil {
				return err
			}
		}
		for tokenId, totals := range s.agg.tokens {
			if err := tx.Model(&model.Token{}).Where("id = ?", tokenId).Updates(map[string]any{
				"used_quota": totals.Quota, "accessed_time": totals.LastAccessAt,
			}).Error; err != nil {
				return err
			}
		}
		for channelId, quota := range s.agg.channels {
			if err := tx.Model(&model.Channel{}).Where("id = ?", channelId).Update("used_quota", quota).Error; err != nil {
				return err
			}
		}
		for periodId, quota := range s.agg.periods {
			if err := tx.Model(&model.EnterpriseCreditPeriod{}).Where("id = ?", periodId).Update("used_quota", quota).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// rollupDays 财务中心读「游标之前走预聚合、之后读 logs」：逐日重算到昨天并推进游标，出账快照因此能读到历史
func (s *seeder) rollupDays() error {
	yesterday := startOfDay(s.now.In(s.loc)).AddDate(0, 0, -1)
	for day := s.start; !day.After(yesterday); day = day.AddDate(0, 0, 1) {
		if _, err := model.RollupLogDay(day.Format("2006-01-02")); err != nil {
			return err
		}
	}
	cursor, err := model.GetLogRollupCursor()
	if err != nil {
		return err
	}
	if cursor >= yesterday.Format("2006-01-02") {
		return nil
	}
	if cursor == "" {
		// 没有游标时任务会从最老的日志补起；示例数据之前的真实日志也要补齐，才能整体推进游标
		oldest, err := model.OldestLogDay()
		if err != nil {
			return err
		}
		cursor = oldest
	}
	for day, _ := time.ParseInLocation("2006-01-02", cursor, s.loc); day.Before(s.start); day = day.AddDate(0, 0, 1) {
		if _, err := model.RollupLogDay(day.Format("2006-01-02")); err != nil {
			return err
		}
	}
	return model.SetLogRollupCursor(yesterday.Format("2006-01-02"))
}

func startOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
