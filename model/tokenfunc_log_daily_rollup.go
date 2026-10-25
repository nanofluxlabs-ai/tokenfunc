package model

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// logs 按天预聚合（TokenFunc 二开，仅 PostgreSQL）。
// 目标：推广中心、财务中心等按用户 × 日期区间统计消耗的读路径不再全区间扫 logs。
//
// 粒度：(上海日, 用户, 日志类型, 分组, 模型)，只收消费(2)与退款(6)两类，与财务中心口径一致。
// 写入：维护任务按天删后重建，重跑幂等；今天永远不写（当天用 logs 实时补齐）。
// 读取：ReadLogDailyUsage 按区间自动分成「头部不满一天 / 完整日 / 尾部与今天」三段，
// 完整日且 ≤ 游标的部分读本表，其余实时查 logs。

// LogDailyRollup 一行 = 一个用户在某个上海日、某类日志、某分组、某模型上的汇总
type LogDailyRollup struct {
	Id               int64  `json:"id" gorm:"primaryKey"`
	Day              string `json:"day" gorm:"type:varchar(10);not null;uniqueIndex:uk_tf_log_daily_rollup,priority:1;index:idx_tf_log_daily_rollup_user_day,priority:2"`
	UserId           int    `json:"user_id" gorm:"not null;uniqueIndex:uk_tf_log_daily_rollup,priority:2;index:idx_tf_log_daily_rollup_user_day,priority:1"`
	LogType          int    `json:"log_type" gorm:"type:smallint;not null;uniqueIndex:uk_tf_log_daily_rollup,priority:3"`
	GroupName        string `json:"group_name" gorm:"type:varchar(255);not null;default:'';uniqueIndex:uk_tf_log_daily_rollup,priority:4"`
	ModelName        string `json:"model_name" gorm:"type:varchar(255);not null;default:'';uniqueIndex:uk_tf_log_daily_rollup,priority:5"`
	Calls            int64  `json:"calls" gorm:"not null;default:0"`
	PromptTokens     int64  `json:"prompt_tokens" gorm:"not null;default:0"`
	CompletionTokens int64  `json:"completion_tokens" gorm:"not null;default:0"`
	Quota            int64  `json:"quota" gorm:"not null;default:0"`
}

func (LogDailyRollup) TableName() string { return "tf_log_daily_rollups" }

const (
	// LogRollupCursorOptionKey options 表里记录「最后一个已完整 rollup 的上海日」；读侧据此判定哪些天可以读预聚合表
	LogRollupCursorOptionKey = "tf_log_rollup_cursor"
	// LogRollupYesterdayDoneOptionKey 记录「已重算过昨天」的日期，保证跨零点迟到写入只吸收一次而不是每小时重算
	LogRollupYesterdayDoneOptionKey = "tf_log_rollup_yesterday_done"

	logRollupInsertBatch = 200
	// logUsageUserIdBatch 实时段与预聚合段按 user_id IN 查询时的单批上限
	logUsageUserIdBatch = 500
)

var ErrLogRollupInvalidDay = errors.New("invalid rollup day")

// LogDailyUsageRow 预聚合表与 logs 实时聚合的公共行形状；Day 为上海日
type LogDailyUsageRow struct {
	Day              string
	UserId           int
	LogType          int
	GroupName        string
	ModelName        string
	Calls            int64
	PromptTokens     int64
	CompletionTokens int64
	Quota            int64
}

// LogUsageTotals 折叠后的汇总：净额 = 消费 − 退款，次数与 token 只计消费
type LogUsageTotals struct {
	ConsumeQuota     int64 `json:"consume_quota"`
	RefundQuota      int64 `json:"refund_quota"`
	NetQuota         int64 `json:"net_quota"`
	Calls            int64 `json:"calls"`
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
}

// Add 按日志类型把一行累加进汇总
func (t *LogUsageTotals) Add(row LogDailyUsageRow) {
	switch row.LogType {
	case LogTypeConsume:
		t.ConsumeQuota += row.Quota
		t.NetQuota += row.Quota
		t.Calls += row.Calls
		t.PromptTokens += row.PromptTokens
		t.CompletionTokens += row.CompletionTokens
	case LogTypeRefund:
		t.RefundQuota += row.Quota
		t.NetQuota -= row.Quota
	}
}

// TotalTokens 输入 + 输出（只计消费）
func (t LogUsageTotals) TotalTokens() int64 {
	return t.PromptTokens + t.CompletionTokens
}

// FoldLogDailyUsage 按任意键折叠（按天 / 按用户 / 按模型）
func FoldLogDailyUsage[K comparable](rows []LogDailyUsageRow, keyOf func(LogDailyUsageRow) K) map[K]*LogUsageTotals {
	result := make(map[K]*LogUsageTotals)
	for _, row := range rows {
		key := keyOf(row)
		totals := result[key]
		if totals == nil {
			totals = &LogUsageTotals{}
			result[key] = totals
		}
		totals.Add(row)
	}
	return result
}

// ---------------------------------------------------------------------------
// 游标（options 表）
// ---------------------------------------------------------------------------

// GetLogRollupCursor 最后一个已完整 rollup 的上海日；没有记录时返回 ""
func GetLogRollupCursor() (string, error) {
	return readTokenfuncOption(LogRollupCursorOptionKey)
}

// SetLogRollupCursor 推进游标
func SetLogRollupCursor(day string) error {
	return writeTokenfuncOption(LogRollupCursorOptionKey, day)
}

// GetLogRollupYesterdayDone 已重算过昨天的日期
func GetLogRollupYesterdayDone() (string, error) {
	return readTokenfuncOption(LogRollupYesterdayDoneOptionKey)
}

// SetLogRollupYesterdayDone 记录昨天已重算
func SetLogRollupYesterdayDone(day string) error {
	return writeTokenfuncOption(LogRollupYesterdayDoneOptionKey, day)
}

// readTokenfuncOption 直接读 options 表。不走 common.OptionMap：游标由单个节点推进，其他副本的内存快照不会同步，读库才是事实
func readTokenfuncOption(key string) (string, error) {
	var option Option
	result := DB.Where(&Option{Key: key}).Limit(1).Find(&option)
	if result.Error != nil {
		return "", result.Error
	}
	if result.RowsAffected == 0 {
		return "", nil
	}
	return option.Value, nil
}

// writeTokenfuncOption upsert options 表；不触发上游 UpdateOption 的校验与内存同步，这些 key 只被二开任务读写
func writeTokenfuncOption(key string, value string) error {
	return DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value"}),
	}).Create(&Option{Key: key, Value: value}).Error
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

// OldestLogDay logs 里最早一条消费 / 退款日志所在的上海日；没有日志时返回 ""
func OldestLogDay() (string, error) {
	var minTs int64
	err := LOG_DB.Raw("SELECT COALESCE(MIN(created_at), 0) FROM logs WHERE type IN ? AND user_id > 0", []int{LogTypeConsume, LogTypeRefund}).Scan(&minTs).Error
	if err != nil {
		return "", err
	}
	if minTs == 0 {
		return "", nil
	}
	return FinanceDay(minTs), nil
}

// RollupLogDay 重建某一天的预聚合：在 LOG_DB 上聚合当天 logs，然后在主库同一事务内删旧行、插新行。
// 返回写入行数。调用方负责不传今天。
func RollupLogDay(day string) (int, error) {
	if err := financeRequirePostgres(); err != nil {
		return 0, err
	}
	r, err := ParseFinanceDayRange(day, day)
	if err != nil {
		return 0, fmt.Errorf("%w: %s", ErrLogRollupInvalidDay, day)
	}
	rows, err := scanLogUsageFromLogs(r, nil, logUsageDimsFull)
	if err != nil {
		return 0, err
	}
	records := make([]LogDailyRollup, 0, len(rows))
	for _, row := range rows {
		records = append(records, LogDailyRollup{
			Day: day, UserId: row.UserId, LogType: row.LogType, GroupName: row.GroupName, ModelName: row.ModelName,
			Calls: row.Calls, PromptTokens: row.PromptTokens, CompletionTokens: row.CompletionTokens, Quota: row.Quota,
		})
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("day = ?", day).Delete(&LogDailyRollup{}).Error; err != nil {
			return err
		}
		if len(records) == 0 {
			return nil
		}
		return tx.CreateInBatches(records, logRollupInsertBatch).Error
	})
	if err != nil {
		return 0, err
	}
	return len(records), nil
}

// ---------------------------------------------------------------------------
// 读取
// ---------------------------------------------------------------------------

// logUsageDims 读取粒度：全维度给推广中心（名下用户少）；按用户 / 按天在 SQL 侧聚合给财务中心（全站用户）
type logUsageDims int

const (
	logUsageDimsFull logUsageDims = iota // (日, 用户, 类型, 分组, 模型)
	logUsageDimsUser                     // (用户, 类型)
	logUsageDimsDay                      // (日, 类型)
)

const logUsageSumsSQL = `COUNT(*)::bigint AS calls, COALESCE(SUM(l.prompt_tokens), 0)::bigint AS prompt_tokens, COALESCE(SUM(l.completion_tokens), 0)::bigint AS completion_tokens, COALESCE(SUM(l.quota), 0)::bigint AS quota`

// logsSelect 实时段在 logs 上的 SELECT 与 GROUP BY
func (d logUsageDims) logsSelect() (string, string) {
	switch d {
	case logUsageDimsUser:
		return "l.user_id, l.type AS log_type, " + logUsageSumsSQL, "1, 2"
	case logUsageDimsDay:
		return financeDayBucketSQL + " AS day, l.type AS log_type, " + logUsageSumsSQL, "1, 2"
	default:
		return fmt.Sprintf("%s AS day, l.user_id, l.type AS log_type, COALESCE(l.%s, '') AS group_name, COALESCE(l.model_name, '') AS model_name, %s",
			financeDayBucketSQL, logGroupCol, logUsageSumsSQL), "1, 2, 3, 4, 5"
	}
}

// rollupSelect 预聚合段在 tf_log_daily_rollups 上的 SELECT 与 GROUP BY（全维度不再聚合）
func (d logUsageDims) rollupSelect() (string, string) {
	const sums = "SUM(calls) AS calls, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(quota) AS quota"
	switch d {
	case logUsageDimsUser:
		return "user_id, log_type, " + sums, "user_id, log_type"
	case logUsageDimsDay:
		return "day, log_type, " + sums, "day, log_type"
	default:
		return "day, user_id, log_type, group_name, model_name, calls, prompt_tokens, completion_tokens, quota", ""
	}
}

// ReadLogDailyUsage 读取若干用户在区间内按 (日, 用户, 类型, 分组, 模型) 的用量。
// userIds 为 nil 表示不限用户；为空切片直接返回空。返回行不跨段合并，调用方用 FoldLogDailyUsage 按需折叠。
//
//	[ r.Start, 首个完整日零点 )                       → logs 实时
//	[ 首个完整日, min(末个完整日+1, 今日零点, 游标+1) ) → tf_log_daily_rollups
//	其余到 r.EndExcl                                  → logs 实时
func ReadLogDailyUsage(userIds []int, r FinanceRange) ([]LogDailyUsageRow, error) {
	return readLogUsage(userIds, r, logUsageDimsFull)
}

// ReadLogUsageByUser 按用户折叠的区间用量（SQL 侧聚合，适合全站用户）；键为 user_id
func ReadLogUsageByUser(userIds []int, r FinanceRange) (map[int]*LogUsageTotals, error) {
	rows, err := readLogUsage(userIds, r, logUsageDimsUser)
	if err != nil {
		return nil, err
	}
	return FoldLogDailyUsage(rows, func(row LogDailyUsageRow) int { return row.UserId }), nil
}

// ReadLogUsageByDay 按上海日折叠的区间用量（SQL 侧聚合）；键为 YYYY-MM-DD
func ReadLogUsageByDay(userIds []int, r FinanceRange) (map[string]*LogUsageTotals, error) {
	rows, err := readLogUsage(userIds, r, logUsageDimsDay)
	if err != nil {
		return nil, err
	}
	return FoldLogDailyUsage(rows, func(row LogDailyUsageRow) string { return row.Day }), nil
}

func readLogUsage(userIds []int, r FinanceRange, dims logUsageDims) ([]LogDailyUsageRow, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, err
	}
	if userIds != nil && len(userIds) == 0 {
		return []LogDailyUsageRow{}, nil
	}
	if r.EndExcl <= r.Start {
		return []LogDailyUsageRow{}, nil
	}
	cursor, err := GetLogRollupCursor()
	if err != nil {
		return nil, err
	}
	loc := enterpriseBillingLocation
	startAt := time.Unix(r.Start, 0).In(loc)
	fullStart := time.Date(startAt.Year(), startAt.Month(), startAt.Day(), 0, 0, 0, 0, loc)
	if fullStart.Unix() < r.Start {
		fullStart = fullStart.AddDate(0, 0, 1)
	}
	endAt := time.Unix(r.EndExcl, 0).In(loc)
	fullEnd := time.Date(endAt.Year(), endAt.Month(), endAt.Day(), 0, 0, 0, 0, loc)
	now := time.Now().In(loc)
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	rollupEnd := fullEnd
	if todayStart.Before(rollupEnd) {
		rollupEnd = todayStart
	}
	if cursor == "" {
		rollupEnd = fullStart
	} else if cursorDay, err := time.ParseInLocation("2006-01-02", cursor, loc); err == nil && cursorDay.AddDate(0, 0, 1).Before(rollupEnd) {
		rollupEnd = cursorDay.AddDate(0, 0, 1)
	}

	rows := make([]LogDailyUsageRow, 0, 64)
	headEnd := min(fullStart.Unix(), r.EndExcl)
	if r.Start < headEnd {
		head, err := scanLogUsageFromLogs(FinanceRange{Start: r.Start, EndExcl: headEnd}, userIds, dims)
		if err != nil {
			return nil, err
		}
		rows = append(rows, head...)
	}
	tailStart := headEnd
	if rollupEnd.After(fullStart) {
		rolled, err := scanLogUsageFromRollups(fullStart.Format("2006-01-02"), rollupEnd.AddDate(0, 0, -1).Format("2006-01-02"), userIds, dims)
		if err != nil {
			return nil, err
		}
		rows = append(rows, rolled...)
		tailStart = rollupEnd.Unix()
	}
	if tailStart < r.EndExcl {
		tail, err := scanLogUsageFromLogs(FinanceRange{Start: tailStart, EndExcl: r.EndExcl}, userIds, dims)
		if err != nil {
			return nil, err
		}
		rows = append(rows, tail...)
	}
	return rows, nil
}

// scanLogUsageFromLogs 在 LOG_DB 上实时聚合 logs；userIds 按批 IN
func scanLogUsageFromLogs(r FinanceRange, userIds []int, dims logUsageDims) ([]LogDailyUsageRow, error) {
	selectSQL, groupBy := dims.logsSelect()
	return scanLogUsageBatched(userIds, func(ids []int) ([]LogDailyUsageRow, error) {
		query := LOG_DB.Table("logs l").Select(selectSQL).
			Where("l.user_id > 0 AND l.type IN ? AND l.created_at >= ? AND l.created_at < ?", []int{LogTypeConsume, LogTypeRefund}, r.Start, r.EndExcl)
		if ids != nil {
			query = query.Where("l.user_id IN ?", ids)
		}
		batch := make([]LogDailyUsageRow, 0)
		if err := query.Group(groupBy).Scan(&batch).Error; err != nil {
			return nil, err
		}
		return batch, nil
	})
}

// scanLogUsageFromRollups 读预聚合表的闭区间 [startDay, endDay]
func scanLogUsageFromRollups(startDay string, endDay string, userIds []int, dims logUsageDims) ([]LogDailyUsageRow, error) {
	selectSQL, groupBy := dims.rollupSelect()
	return scanLogUsageBatched(userIds, func(ids []int) ([]LogDailyUsageRow, error) {
		query := DB.Model(&LogDailyRollup{}).Select(selectSQL).Where("day >= ? AND day <= ?", startDay, endDay)
		if ids != nil {
			query = query.Where("user_id IN ?", ids)
		}
		if groupBy != "" {
			query = query.Group(groupBy)
		}
		batch := make([]LogDailyUsageRow, 0)
		if err := query.Scan(&batch).Error; err != nil {
			return nil, err
		}
		return batch, nil
	})
}

// scanLogUsageBatched userIds 为 nil 时跑一次不过滤，否则按 logUsageUserIdBatch 分批 IN 后拼接
func scanLogUsageBatched(userIds []int, run func(ids []int) ([]LogDailyUsageRow, error)) ([]LogDailyUsageRow, error) {
	if userIds == nil {
		return run(nil)
	}
	rows := make([]LogDailyUsageRow, 0)
	for start := 0; start < len(userIds); start += logUsageUserIdBatch {
		batch, err := run(userIds[start:min(start+logUsageUserIdBatch, len(userIds))])
		if err != nil {
			return nil, err
		}
		rows = append(rows, batch...)
	}
	return rows, nil
}
