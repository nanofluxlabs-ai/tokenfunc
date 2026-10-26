package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// 使用日志页统计徽标（TokenFunc 二开，只支持 PostgreSQL）：筛选条件与日志列表同一个 LogFilter，
// 区间内的请求数 / 净消耗 / token 拆分 / 错误数一条 SQL 聚合，实时 RPM / TPM 沿用上游「最近 60 秒」口径。

// logStatDimsSQL 从 logs.other 派生缓存维度，口径与 financeLogFromSQL 一致（别名用 logs 以复用 LogFilter.apply）
const logStatDimsSQL = `CROSS JOIN LATERAL (SELECT CASE WHEN logs.other LIKE '{%' THEN logs.other::jsonb ELSE '{}'::jsonb END AS j) o
CROSS JOIN LATERAL (SELECT
	COALESCE((o.j->>'cache_tokens')::numeric, 0)::bigint AS cache_read,
	COALESCE((o.j->>'cache_creation_tokens')::numeric, 0)::bigint AS cache_write_total,
	COALESCE((o.j->>'cache_creation_tokens_5m')::numeric, 0)::bigint + COALESCE((o.j->>'cache_creation_tokens_1h')::numeric, 0)::bigint AS cache_write_split,
	(COALESCE(o.j->>'usage_semantic', '') = 'anthropic' OR jsonb_exists(o.j, 'cache_creation_tokens')) AS is_net
) b
CROSS JOIN LATERAL (SELECT
	b.cache_read, b.is_net,
	CASE WHEN b.cache_write_split > 0 THEN b.cache_write_split ELSE b.cache_write_total END AS cache_write
) d`

// logStatSumsSQL 区间度量：请求数、token 与缓存只计消费行，退款单独累计，错误行只计次数
const logStatSumsSQL = `COUNT(*) FILTER (WHERE logs.type = 2)::bigint AS requests,
	COALESCE(SUM(logs.quota) FILTER (WHERE logs.type = 2), 0)::bigint AS consume_quota,
	COALESCE(SUM(logs.quota) FILTER (WHERE logs.type = 6), 0)::bigint AS refund_quota,
	COALESCE(SUM(logs.prompt_tokens) FILTER (WHERE logs.type = 2), 0)::bigint AS prompt_tokens,
	COALESCE(SUM(logs.completion_tokens) FILTER (WHERE logs.type = 2), 0)::bigint AS completion_tokens,
	COALESCE(SUM(CASE WHEN d.is_net THEN logs.prompt_tokens::bigint + d.cache_read + d.cache_write ELSE logs.prompt_tokens::bigint END) FILTER (WHERE logs.type = 2), 0)::bigint AS input_tokens_total,
	COALESCE(SUM(d.cache_read) FILTER (WHERE logs.type = 2), 0)::bigint AS cache_read_tokens,
	COALESCE(SUM(d.cache_write) FILTER (WHERE logs.type = 2), 0)::bigint AS cache_write_tokens,
	COUNT(*) FILTER (WHERE logs.type = 5)::bigint AS error_count`

// logStatLiveWindowSeconds 实时 RPM / TPM 的统计窗口
const logStatLiveWindowSeconds = 60

// LogStatSummary 日志页统计：NetQuota = 消费 − 退款；InputTokensTotal 为含缓存的输入总量（缓存命中率的分母）
type LogStatSummary struct {
	Requests         int64 `json:"requests"`
	ConsumeQuota     int64 `json:"consume_quota"`
	RefundQuota      int64 `json:"refund_quota"`
	NetQuota         int64 `json:"net_quota" gorm:"-"`
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	InputTokensTotal int64 `json:"input_tokens_total"`
	CacheReadTokens  int64 `json:"cache_read_tokens"`
	CacheWriteTokens int64 `json:"cache_write_tokens"`
	ErrorCount       int64 `json:"error_count"`
	Rpm              int64 `json:"rpm" gorm:"-"`
	Tpm              int64 `json:"tpm" gorm:"-"`
}

// SumLogStat 按日志列表的筛选条件统计；userId > 0 时只统计该用户。filter.Type 不参与（统计自行按类型分桶）
func SumLogStat(userId int, filter LogFilter) (LogStatSummary, error) {
	var stat LogStatSummary
	if err := financeRequirePostgres(); err != nil {
		return stat, err
	}
	filter.Type = LogTypeUnknown
	base := LOG_DB.Table("logs")
	if userId > 0 {
		base = base.Where("logs.user_id = ?", userId)
	}
	tx, err := filter.apply(base.Session(&gorm.Session{}))
	if err != nil {
		return stat, err
	}
	err = tx.Joins(logStatDimsSQL).
		Where("logs.type IN ?", []int{LogTypeConsume, LogTypeError, LogTypeRefund}).
		Select(logStatSumsSQL).Scan(&stat).Error
	if err != nil {
		common.SysError(common.LogText("failed to query log stat: %s", err.Error()))
		return stat, common.NewMessage("Failed to query statistics")
	}
	stat.NetQuota = stat.ConsumeQuota - stat.RefundQuota

	live := filter
	live.StartTimestamp = time.Now().Unix() - logStatLiveWindowSeconds
	live.EndTimestamp = 0
	liveTx, err := live.apply(base.Session(&gorm.Session{}))
	if err != nil {
		return stat, err
	}
	var rate struct {
		Rpm int64
		Tpm int64
	}
	err = liveTx.Where("logs.type = ?", LogTypeConsume).
		Select("COUNT(*)::bigint AS rpm, (COALESCE(SUM(logs.prompt_tokens), 0) + COALESCE(SUM(logs.completion_tokens), 0))::bigint AS tpm").
		Scan(&rate).Error
	if err != nil {
		common.SysError(common.LogText("failed to query rpm/tpm stat: %s", err.Error()))
		return stat, common.NewMessage("Failed to query statistics")
	}
	stat.Rpm, stat.Tpm = rate.Rpm, rate.Tpm
	return stat, nil
}
