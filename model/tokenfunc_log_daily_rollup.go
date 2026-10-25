package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// logs 按天预聚合（TokenFunc 二开，仅 PostgreSQL）。
// 目标：推广中心、财务中心等按用户 × 日期区间统计消耗的读路径不再全区间扫 logs。
//
// 粒度：(上海日, 用户, 日志类型, 分组, 模型, 渠道)，只收消费(2)与退款(6)两类，与财务中心口径一致。
// 度量除次数 / token / 额度外，还带财务中心用户消耗页的拆分列（文本 / 缓存 / 音频 token、钱包 / 订阅扣费）与该行最后一条消费时间，
// 这样原始日志归档删除后，财务中心的拆分列与模型消费（渠道维度）仍有数据。拆分口径见 finance_log_dims.go 的 financeLogFromSQL。
// 写入：维护任务按天删后重建，重跑幂等；今天永远不写（当天用 logs 实时补齐）。
// 读取：ReadLogDailyUsage 按区间自动分成「头部不满一天 / 完整日 / 尾部与今天」三段，
// 完整日且 ≤ 游标的部分读本表，其余实时查 logs。

// LogDailyRollup 一行 = 一个用户在某个上海日、某类日志、某分组、某模型上的汇总
// 唯一索引名带 v2：v1 没有 channel_id，升级时由 MigrateLogDailyRollupV2 删掉旧索引并清表重建。
type LogDailyRollup struct {
	Id               int64  `json:"id" gorm:"primaryKey"`
	Day              string `json:"day" gorm:"type:varchar(10);not null;uniqueIndex:uk_tf_log_daily_rollup_v2,priority:1;index:idx_tf_log_daily_rollup_user_day,priority:2"`
	UserId           int    `json:"user_id" gorm:"not null;uniqueIndex:uk_tf_log_daily_rollup_v2,priority:2;index:idx_tf_log_daily_rollup_user_day,priority:1"`
	LogType          int    `json:"log_type" gorm:"type:smallint;not null;uniqueIndex:uk_tf_log_daily_rollup_v2,priority:3"`
	GroupName        string `json:"group_name" gorm:"type:varchar(255);not null;default:'';uniqueIndex:uk_tf_log_daily_rollup_v2,priority:4"`
	ModelName        string `json:"model_name" gorm:"type:varchar(255);not null;default:'';uniqueIndex:uk_tf_log_daily_rollup_v2,priority:5"`
	ChannelId        int    `json:"channel_id" gorm:"not null;default:0;uniqueIndex:uk_tf_log_daily_rollup_v2,priority:6"`
	Calls            int64  `json:"calls" gorm:"not null;default:0"`
	PromptTokens     int64  `json:"prompt_tokens" gorm:"not null;default:0"`
	CompletionTokens int64  `json:"completion_tokens" gorm:"not null;default:0"`
	Quota            int64  `json:"quota" gorm:"not null;default:0"`
	// 以下只对消费行有值（退款行为 0）
	TextInputTokens   int64 `json:"text_input_tokens" gorm:"not null;default:0"`
	TextOutputTokens  int64 `json:"text_output_tokens" gorm:"not null;default:0"`
	CacheReadTokens   int64 `json:"cache_read_tokens" gorm:"not null;default:0"`
	CacheWriteTokens  int64 `json:"cache_write_tokens" gorm:"not null;default:0"`
	AudioInputTokens  int64 `json:"audio_input_tokens" gorm:"not null;default:0"`
	AudioOutputTokens int64 `json:"audio_output_tokens" gorm:"not null;default:0"`
	WalletQuota       int64 `json:"wallet_quota" gorm:"not null;default:0"`
	SubscriptionQuota int64 `json:"subscription_quota" gorm:"not null;default:0"`
	LastConsumeAt     int64 `json:"last_consume_at" gorm:"not null;default:0"`
}

func (LogDailyRollup) TableName() string { return "tf_log_daily_rollups" }

// LogRollupSchemaVersion 当前表结构版本；options 里的 tf_log_rollup_schema 落后时触发一次性重建
const LogRollupSchemaVersion = "2"

const (
	// LogRollupCursorOptionKey options 表里记录「最后一个已完整 rollup 的上海日」；读侧据此判定哪些天可以读预聚合表
	LogRollupCursorOptionKey = "tf_log_rollup_cursor"
	// LogRollupYesterdayDoneOptionKey 记录「已重算过昨天」的日期，保证跨零点迟到写入只吸收一次而不是每小时重算
	LogRollupYesterdayDoneOptionKey = "tf_log_rollup_yesterday_done"
	// LogRollupSchemaOptionKey 记录预聚合表已迁到的结构版本
	LogRollupSchemaOptionKey = "tf_log_rollup_schema"

	logRollupInsertBatch = 200
	// logUsageUserIdBatch 实时段与预聚合段按 user_id IN 查询时的单批上限
	logUsageUserIdBatch = 500
)

var ErrLogRollupInvalidDay = errors.New("invalid rollup day")

// LogDailyUsageRow 预聚合表与 logs 实时聚合的公共行形状；Day 为上海日
type LogDailyUsageRow struct {
	Day               string
	UserId            int
	LogType           int
	GroupName         string
	ModelName         string
	ChannelId         int
	Calls             int64
	PromptTokens      int64
	CompletionTokens  int64
	Quota             int64
	TextInputTokens   int64
	TextOutputTokens  int64
	CacheReadTokens   int64
	CacheWriteTokens  int64
	AudioInputTokens  int64
	AudioOutputTokens int64
	WalletQuota       int64
	SubscriptionQuota int64
	LastConsumeAt     int64
}

// LogUsageTotals 折叠后的汇总：净额 = 消费 − 退款，次数 / token / 拆分列只计消费，LastConsumeAt 取消费行最大值
type LogUsageTotals struct {
	ConsumeQuota      int64 `json:"consume_quota"`
	RefundQuota       int64 `json:"refund_quota"`
	NetQuota          int64 `json:"net_quota"`
	Calls             int64 `json:"calls"`
	PromptTokens      int64 `json:"prompt_tokens"`
	CompletionTokens  int64 `json:"completion_tokens"`
	TextInputTokens   int64 `json:"text_input_tokens"`
	TextOutputTokens  int64 `json:"text_output_tokens"`
	CacheReadTokens   int64 `json:"cache_read_tokens"`
	CacheWriteTokens  int64 `json:"cache_write_tokens"`
	AudioInputTokens  int64 `json:"audio_input_tokens"`
	AudioOutputTokens int64 `json:"audio_output_tokens"`
	WalletQuota       int64 `json:"wallet_quota"`
	SubscriptionQuota int64 `json:"subscription_quota"`
	LastConsumeAt     int64 `json:"last_consume_at"`
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
		t.TextInputTokens += row.TextInputTokens
		t.TextOutputTokens += row.TextOutputTokens
		t.CacheReadTokens += row.CacheReadTokens
		t.CacheWriteTokens += row.CacheWriteTokens
		t.AudioInputTokens += row.AudioInputTokens
		t.AudioOutputTokens += row.AudioOutputTokens
		t.WalletQuota += row.WalletQuota
		t.SubscriptionQuota += row.SubscriptionQuota
		t.LastConsumeAt = max(t.LastConsumeAt, row.LastConsumeAt)
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

// GetTokenfuncOption 读二开自用的 options 键；没有记录返回 ""
func GetTokenfuncOption(key string) (string, error) { return readTokenfuncOption(key) }

// SetTokenfuncOption upsert 二开自用的 options 键
func SetTokenfuncOption(key string, value string) error { return writeTokenfuncOption(key, value) }

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
// 结构升级
// ---------------------------------------------------------------------------

// MigrateLogDailyRollupV2 一次性把 v1（无渠道、无拆分列）升级到 v2：删旧唯一索引、清掉可重建的行、游标归零，由维护任务从头重建。
// 已经归档删除（purged）的天无法重建，这些天的 v1 行原样保留（渠道与拆分列为 0），游标停在最后一个 purged 日。
// 在 AutoMigrate 之后调用；options 里 tf_log_rollup_schema 已是当前版本时直接返回，重复启动幂等。
func MigrateLogDailyRollupV2() error {
	if !common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		return nil
	}
	version, err := readTokenfuncOption(LogRollupSchemaOptionKey)
	if err != nil {
		return err
	}
	if version == LogRollupSchemaVersion {
		return nil
	}
	var lastPurgedDay string
	err = DB.Model(&LogArchiveManifest{}).Where("status = ?", LogArchiveStatusPurged).Select("COALESCE(MAX(day), '')").Scan(&lastPurgedDay).Error
	if err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DROP INDEX IF EXISTS uk_tf_log_daily_rollup").Error; err != nil {
			return err
		}
		if err := tx.Where("day > ?", lastPurgedDay).Delete(&LogDailyRollup{}).Error; err != nil {
			return err
		}
		for _, key := range []string{LogRollupCursorOptionKey, LogRollupYesterdayDoneOptionKey} {
			if err := tx.Where(&Option{Key: key}).Delete(&Option{}).Error; err != nil {
				return err
			}
		}
		if lastPurgedDay != "" {
			if err := tx.Create(&Option{Key: LogRollupCursorOptionKey, Value: lastPurgedDay}).Error; err != nil {
				return err
			}
		}
		common.SysLog(fmt.Sprintf("log daily rollup schema upgraded to v%s: rows after %q cleared, cursor reset for rebuild", LogRollupSchemaVersion, lastPurgedDay))
		return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "key"}}, DoUpdates: clause.AssignmentColumns([]string{"value"})}).
			Create(&Option{Key: LogRollupSchemaOptionKey, Value: LogRollupSchemaVersion}).Error
	})
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
	rows, err := scanLogUsageFromLogs(r, logUsageFilter{}, logUsageDimsFull)
	if err != nil {
		return 0, err
	}
	records := make([]LogDailyRollup, 0, len(rows))
	for _, row := range rows {
		records = append(records, LogDailyRollup{
			Day: day, UserId: row.UserId, LogType: row.LogType, GroupName: row.GroupName, ModelName: row.ModelName, ChannelId: row.ChannelId,
			Calls: row.Calls, PromptTokens: row.PromptTokens, CompletionTokens: row.CompletionTokens, Quota: row.Quota,
			TextInputTokens: row.TextInputTokens, TextOutputTokens: row.TextOutputTokens, CacheReadTokens: row.CacheReadTokens, CacheWriteTokens: row.CacheWriteTokens,
			AudioInputTokens: row.AudioInputTokens, AudioOutputTokens: row.AudioOutputTokens, WalletQuota: row.WalletQuota, SubscriptionQuota: row.SubscriptionQuota,
			LastConsumeAt: row.LastConsumeAt,
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

// logUsageDims 读取粒度：全维度给推广中心（名下用户少）；按用户 / 按天 / 按模型×渠道在 SQL 侧聚合给财务中心（全站）
type logUsageDims int

const (
	logUsageDimsFull         logUsageDims = iota // (日, 用户, 类型, 分组, 模型, 渠道)
	logUsageDimsUser                             // (用户, 类型)
	logUsageDimsDay                              // (日, 类型)
	logUsageDimsModelChannel                     // (类型, 分组, 模型, 渠道)
)

// logUsageFilter 读取过滤：UserIds 为 nil 不限用户、为空切片直接返回空；ModelLike 为模型名模糊匹配（已转义）；Group 为分组精确匹配
type logUsageFilter struct {
	UserIds   []int
	ModelLike string
	Group     string
}

// logUsageSumsSQL 实时段在 logs 上的度量：拆分列只计消费行，口径与 financeLogFromSQL 派生列一致（见 finance_consumption.go 旧实现）
const logUsageSumsSQL = `COUNT(*)::bigint AS calls, COALESCE(SUM(l.prompt_tokens), 0)::bigint AS prompt_tokens, COALESCE(SUM(l.completion_tokens), 0)::bigint AS completion_tokens, COALESCE(SUM(l.quota), 0)::bigint AS quota,
	COALESCE(SUM(CASE WHEN l.type = 2 THEN COALESCE(d.text_in, CASE WHEN d.is_net THEN GREATEST(l.prompt_tokens::bigint - d.audio_in, 0) ELSE GREATEST(l.prompt_tokens::bigint - d.audio_in - d.cache_read - d.cache_write, 0) END) ELSE 0 END), 0)::bigint AS text_input_tokens,
	COALESCE(SUM(CASE WHEN l.type = 2 THEN COALESCE(d.text_out, GREATEST(l.completion_tokens::bigint - d.audio_out, 0)) ELSE 0 END), 0)::bigint AS text_output_tokens,
	COALESCE(SUM(CASE WHEN l.type = 2 THEN d.cache_read ELSE 0 END), 0)::bigint AS cache_read_tokens,
	COALESCE(SUM(CASE WHEN l.type = 2 THEN d.cache_write ELSE 0 END), 0)::bigint AS cache_write_tokens,
	COALESCE(SUM(CASE WHEN l.type = 2 THEN d.audio_in ELSE 0 END), 0)::bigint AS audio_input_tokens,
	COALESCE(SUM(CASE WHEN l.type = 2 THEN d.audio_out ELSE 0 END), 0)::bigint AS audio_output_tokens,
	COALESCE(SUM(CASE WHEN l.type = 2 AND d.billing_source = 'subscription' THEN COALESCE(d.wallet_deducted, 0) WHEN l.type = 2 THEN l.quota::bigint ELSE 0 END), 0)::bigint AS wallet_quota,
	COALESCE(SUM(CASE WHEN l.type = 2 AND d.billing_source = 'subscription' THEN COALESCE(NULLIF(d.sub_consumed, 0), l.quota::bigint) ELSE 0 END), 0)::bigint AS subscription_quota,
	COALESCE(MAX(CASE WHEN l.type = 2 THEN l.created_at END), 0)::bigint AS last_consume_at`

// rollupSumsSQL 预聚合段再聚合时的度量
const rollupSumsSQL = `SUM(calls) AS calls, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(quota) AS quota,
	SUM(text_input_tokens) AS text_input_tokens, SUM(text_output_tokens) AS text_output_tokens, SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens,
	SUM(audio_input_tokens) AS audio_input_tokens, SUM(audio_output_tokens) AS audio_output_tokens, SUM(wallet_quota) AS wallet_quota, SUM(subscription_quota) AS subscription_quota,
	MAX(last_consume_at) AS last_consume_at`

// logsSelect 实时段在 logs 上的 SELECT 与 GROUP BY
func (d logUsageDims) logsSelect() (string, string) {
	switch d {
	case logUsageDimsUser:
		return "l.user_id, l.type AS log_type, " + logUsageSumsSQL, "1, 2"
	case logUsageDimsDay:
		return financeDayBucketSQL + " AS day, l.type AS log_type, " + logUsageSumsSQL, "1, 2"
	case logUsageDimsModelChannel:
		return fmt.Sprintf("l.type AS log_type, COALESCE(l.%s, '') AS group_name, COALESCE(l.model_name, '') AS model_name, l.channel_id, %s", logGroupCol, logUsageSumsSQL), "1, 2, 3, 4"
	default:
		return fmt.Sprintf("%s AS day, l.user_id, l.type AS log_type, COALESCE(l.%s, '') AS group_name, COALESCE(l.model_name, '') AS model_name, l.channel_id, %s",
			financeDayBucketSQL, logGroupCol, logUsageSumsSQL), "1, 2, 3, 4, 5, 6"
	}
}

// rollupSelect 预聚合段在 tf_log_daily_rollups 上的 SELECT 与 GROUP BY（全维度不再聚合）
func (d logUsageDims) rollupSelect() (string, string) {
	switch d {
	case logUsageDimsUser:
		return "user_id, log_type, " + rollupSumsSQL, "user_id, log_type"
	case logUsageDimsDay:
		return "day, log_type, " + rollupSumsSQL, "day, log_type"
	case logUsageDimsModelChannel:
		return "log_type, group_name, model_name, channel_id, " + rollupSumsSQL, "log_type, group_name, model_name, channel_id"
	default:
		return "*", ""
	}
}

// ReadLogDailyUsage 读取若干用户在区间内按 (日, 用户, 类型, 分组, 模型) 的用量。
// userIds 为 nil 表示不限用户；为空切片直接返回空。返回行不跨段合并，调用方用 FoldLogDailyUsage 按需折叠。
//
//	[ r.Start, 首个完整日零点 )                       → logs 实时
//	[ 首个完整日, min(末个完整日+1, 今日零点, 游标+1) ) → tf_log_daily_rollups
//	其余到 r.EndExcl                                  → logs 实时
func ReadLogDailyUsage(userIds []int, r FinanceRange) ([]LogDailyUsageRow, error) {
	return readLogUsage(logUsageFilter{UserIds: userIds}, r, logUsageDimsFull)
}

// ReadLogUsageByUser 按用户折叠的区间用量（SQL 侧聚合，适合全站用户）；键为 user_id
func ReadLogUsageByUser(userIds []int, r FinanceRange) (map[int]*LogUsageTotals, error) {
	rows, err := readLogUsage(logUsageFilter{UserIds: userIds}, r, logUsageDimsUser)
	if err != nil {
		return nil, err
	}
	return FoldLogDailyUsage(rows, func(row LogDailyUsageRow) int { return row.UserId }), nil
}

// LogUsageModelChannelKey 模型消费的折叠键
type LogUsageModelChannelKey struct {
	GroupName string
	ModelName string
	ChannelId int
}

// ReadLogUsageByModelChannel 按 (分组, 模型, 渠道) 折叠的区间用量（SQL 侧聚合）；modelLike 为模型名子串（未转义），group 为分组精确匹配
func ReadLogUsageByModelChannel(userIds []int, modelLike string, group string, r FinanceRange) (map[LogUsageModelChannelKey]*LogUsageTotals, error) {
	filter := logUsageFilter{UserIds: userIds, Group: group}
	if modelLike != "" {
		filter.ModelLike = financeContainsPattern(modelLike)
	}
	rows, err := readLogUsage(filter, r, logUsageDimsModelChannel)
	if err != nil {
		return nil, err
	}
	return FoldLogDailyUsage(rows, func(row LogDailyUsageRow) LogUsageModelChannelKey {
		return LogUsageModelChannelKey{GroupName: row.GroupName, ModelName: row.ModelName, ChannelId: row.ChannelId}
	}), nil
}

// ReadLogUsageByDay 按上海日折叠的区间用量（SQL 侧聚合）；键为 YYYY-MM-DD
func ReadLogUsageByDay(userIds []int, r FinanceRange) (map[string]*LogUsageTotals, error) {
	rows, err := readLogUsage(logUsageFilter{UserIds: userIds}, r, logUsageDimsDay)
	if err != nil {
		return nil, err
	}
	return FoldLogDailyUsage(rows, func(row LogDailyUsageRow) string { return row.Day }), nil
}

func readLogUsage(filter logUsageFilter, r FinanceRange, dims logUsageDims) ([]LogDailyUsageRow, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, err
	}
	if filter.UserIds != nil && len(filter.UserIds) == 0 {
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
		head, err := scanLogUsageFromLogs(FinanceRange{Start: r.Start, EndExcl: headEnd}, filter, dims)
		if err != nil {
			return nil, err
		}
		rows = append(rows, head...)
	}
	tailStart := headEnd
	if rollupEnd.After(fullStart) {
		rolled, err := scanLogUsageFromRollups(fullStart.Format("2006-01-02"), rollupEnd.AddDate(0, 0, -1).Format("2006-01-02"), filter, dims)
		if err != nil {
			return nil, err
		}
		rows = append(rows, rolled...)
		tailStart = rollupEnd.Unix()
	}
	if tailStart < r.EndExcl {
		tail, err := scanLogUsageFromLogs(FinanceRange{Start: tailStart, EndExcl: r.EndExcl}, filter, dims)
		if err != nil {
			return nil, err
		}
		rows = append(rows, tail...)
	}
	return rows, nil
}

// scanLogUsageFromLogs 在 LOG_DB 上实时聚合 logs；userIds 按批 IN。FROM 用 financeLogFromSQL 以取得拆分列的派生维度
func scanLogUsageFromLogs(r FinanceRange, filter logUsageFilter, dims logUsageDims) ([]LogDailyUsageRow, error) {
	selectSQL, groupBy := dims.logsSelect()
	return scanLogUsageBatched(filter.UserIds, func(ids []int) ([]LogDailyUsageRow, error) {
		where := "l.user_id > 0 AND l.type IN ? AND l.created_at >= ? AND l.created_at < ?"
		args := []any{[]int{LogTypeConsume, LogTypeRefund}, r.Start, r.EndExcl}
		if ids != nil {
			where += " AND l.user_id IN ?"
			args = append(args, ids)
		}
		if filter.ModelLike != "" {
			where += " AND l.model_name ILIKE ? ESCAPE '!'"
			args = append(args, filter.ModelLike)
		}
		if filter.Group != "" {
			where += " AND l." + logGroupCol + " = ?"
			args = append(args, filter.Group)
		}
		batch := make([]LogDailyUsageRow, 0)
		query := fmt.Sprintf("SELECT %s %s WHERE %s GROUP BY %s", selectSQL, financeLogFromSQL, where, groupBy)
		if err := LOG_DB.Raw(query, args...).Scan(&batch).Error; err != nil {
			return nil, err
		}
		return batch, nil
	})
}

// scanLogUsageFromRollups 读预聚合表的闭区间 [startDay, endDay]
func scanLogUsageFromRollups(startDay string, endDay string, filter logUsageFilter, dims logUsageDims) ([]LogDailyUsageRow, error) {
	selectSQL, groupBy := dims.rollupSelect()
	return scanLogUsageBatched(filter.UserIds, func(ids []int) ([]LogDailyUsageRow, error) {
		query := DB.Model(&LogDailyRollup{}).Select(selectSQL).Where("day >= ? AND day <= ?", startDay, endDay)
		if ids != nil {
			query = query.Where("user_id IN ?", ids)
		}
		if filter.ModelLike != "" {
			query = query.Where("model_name ILIKE ? ESCAPE '!'", filter.ModelLike)
		}
		if filter.Group != "" {
			query = query.Where("group_name = ?", filter.Group)
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
