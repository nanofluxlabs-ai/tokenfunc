package model

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// 财务中心（TokenFunc 二开）只支持 PostgreSQL：直接用 jsonb 从 logs.other 里取计费维度，不加冗余列、不建预聚合表。
// 本文件是日志维度的单一事实来源：时间区间、日分桶、行级派生 SQL、倍率分布归并与单价计算，所有财务查询共用。

var (
	ErrFinanceRequiresPostgres = errors.New("finance center requires PostgreSQL for both main and log databases")
	ErrFinanceRangeTooLarge    = errors.New("date range too large")
	ErrFinanceInvalidRange     = errors.New("invalid date range")
)

// FinanceMaxRangeDays 聚合类接口允许的最大跨度（按天）
const FinanceMaxRangeDays = 92

// financeTimeZone PG 侧日分桶使用的时区名，与 enterpriseBillingLocation 一致；不能用 Location.String()，fallback 的 "CST" 在 PG 里是美国中部时间
const financeTimeZone = "Asia/Shanghai"

// financeDayBucketSQL logs.created_at → 'YYYY-MM-DD'（上海时区）
const financeDayBucketSQL = "to_char(to_timestamp(l.created_at) AT TIME ZONE '" + financeTimeZone + "', 'YYYY-MM-DD')"

// financeLogFromSQL 带派生列的 logs FROM 片段。别名：l = logs，o.j = other 的 jsonb，d = 派生维度。
// 口径（见 service/log_info_generate.go、service/text_quota.go）：
//   - cache_write：5m + 1h 之和；两者都为 0 时取 cache_creation_tokens（非 Claude 或旧日志只有合计）
//   - is_net：usage_semantic=anthropic 或写了 cache_creation_tokens 键时，prompt_tokens 已不含缓存；否则 prompt 含缓存需扣除
//   - group_ratio：user_group_ratio 存在且不等于 -1 时优先（专属分组倍率）
//   - model_price：仅 >= 0 视为按次计费（写入侧用 -1 表示按量）
//   - 非 JSON 对象的 other 当作 {}；GORM 用 ? 作占位符，所以键存在判断用 jsonb_exists 而不是 ? 运算符
const financeLogFromSQL = `FROM logs l
CROSS JOIN LATERAL (SELECT CASE WHEN l.other LIKE '{%' THEN l.other::jsonb ELSE '{}'::jsonb END AS j) o
CROSS JOIN LATERAL (SELECT
	COALESCE((o.j->>'cache_tokens')::numeric, 0)::bigint AS cache_read,
	COALESCE((o.j->>'cache_creation_tokens')::numeric, 0)::bigint AS cache_write_total,
	COALESCE((o.j->>'cache_creation_tokens_5m')::numeric, 0)::bigint AS cache_write_5m,
	COALESCE((o.j->>'cache_creation_tokens_1h')::numeric, 0)::bigint AS cache_write_1h,
	COALESCE((o.j->>'audio_input')::numeric, 0)::bigint AS audio_in,
	COALESCE((o.j->>'audio_output')::numeric, 0)::bigint AS audio_out,
	(o.j->>'text_input')::numeric::bigint AS text_in,
	(o.j->>'text_output')::numeric::bigint AS text_out,
	(COALESCE(o.j->>'usage_semantic', '') = 'anthropic' OR jsonb_exists(o.j, 'cache_creation_tokens')) AS is_net,
	(o.j->>'model_ratio')::double precision AS model_ratio,
	(o.j->>'group_ratio')::double precision AS base_group_ratio,
	(o.j->>'user_group_ratio')::double precision AS user_group_ratio,
	(o.j->>'completion_ratio')::double precision AS completion_ratio,
	(o.j->>'cache_ratio')::double precision AS cache_ratio,
	(o.j->>'cache_creation_ratio')::double precision AS cache_creation_ratio,
	(o.j->>'cache_creation_ratio_1h')::double precision AS cache_creation_ratio_1h,
	(o.j->>'model_price')::double precision AS raw_model_price,
	o.j->>'billing_source' AS billing_source,
	COALESCE((o.j->>'subscription_consumed')::numeric, 0)::bigint AS sub_consumed,
	(o.j->>'wallet_quota_deducted')::numeric::bigint AS wallet_deducted
) b
CROSS JOIN LATERAL (SELECT
	b.cache_read, b.cache_write_1h, b.audio_in, b.audio_out, b.text_in, b.text_out, b.is_net,
	b.model_ratio, b.completion_ratio, b.cache_ratio, b.cache_creation_ratio, b.cache_creation_ratio_1h,
	b.billing_source, b.sub_consumed, b.wallet_deducted,
	CASE WHEN b.cache_write_5m + b.cache_write_1h > 0 THEN b.cache_write_5m + b.cache_write_1h ELSE b.cache_write_total END AS cache_write,
	(b.user_group_ratio IS NOT NULL AND b.user_group_ratio <> -1) AS group_exclusive,
	CASE WHEN b.user_group_ratio IS NOT NULL AND b.user_group_ratio <> -1 THEN b.user_group_ratio ELSE b.base_group_ratio END AS group_ratio,
	CASE WHEN b.raw_model_price >= 0 THEN b.raw_model_price END AS model_price
) d
CROSS JOIN LATERAL (SELECT
	CASE WHEN d.is_net THEN l.prompt_tokens::bigint ELSE GREATEST(l.prompt_tokens::bigint - d.cache_read - d.cache_write, 0) END AS input_tokens
) e`

// financeRequirePostgres 主库与日志库都必须是 PG（ClickHouse / MySQL / SQLite 不做回退）
func financeRequirePostgres() error {
	if !common.UsingMainDatabase(common.DatabaseTypePostgreSQL) || !common.UsingLogDatabase(common.DatabaseTypePostgreSQL) {
		return ErrFinanceRequiresPostgres
	}
	return nil
}

// ---------------------------------------------------------------------------
// 时间区间
// ---------------------------------------------------------------------------

// FinanceRange 半开区间 [Start, EndExcl)，秒级时间戳
type FinanceRange struct {
	Start   int64
	EndExcl int64
}

// FinanceDay 按上海时区把时间戳转成 YYYY-MM-DD
func FinanceDay(timestamp int64) string {
	return enterpriseUsageDay(timestamp)
}

// FinanceToday 上海时区的今天
func FinanceToday() string {
	return time.Now().In(enterpriseBillingLocation).Format("2006-01-02")
}

// ParseFinanceDayRange 把 YYYY-MM-DD 的闭区间 [startDay, endDay] 转成半开时间戳区间
func ParseFinanceDayRange(startDay string, endDay string) (FinanceRange, error) {
	start, err := time.ParseInLocation("2006-01-02", startDay, enterpriseBillingLocation)
	if err != nil {
		return FinanceRange{}, fmt.Errorf("%w: invalid start_date %q", ErrFinanceInvalidRange, startDay)
	}
	end, err := time.ParseInLocation("2006-01-02", endDay, enterpriseBillingLocation)
	if err != nil {
		return FinanceRange{}, fmt.Errorf("%w: invalid end_date %q", ErrFinanceInvalidRange, endDay)
	}
	if end.Before(start) {
		return FinanceRange{}, fmt.Errorf("%w: end_date before start_date", ErrFinanceInvalidRange)
	}
	return FinanceRange{Start: start.Unix(), EndExcl: end.AddDate(0, 0, 1).Unix()}, nil
}

// FinanceRangeFromTimestamps 把闭区间 [tsStart, tsEnd] 转成半开区间
func FinanceRangeFromTimestamps(tsStart int64, tsEnd int64) (FinanceRange, error) {
	if tsStart < 0 || tsEnd < tsStart {
		return FinanceRange{}, fmt.Errorf("%w: ts_end before ts_start", ErrFinanceInvalidRange)
	}
	return FinanceRange{Start: tsStart, EndExcl: tsEnd + 1}, nil
}

// CheckMaxDays 聚合类接口的跨度上限
func (r FinanceRange) CheckMaxDays(maxDays int) error {
	if r.EndExcl-r.Start > int64(maxDays)*86400 {
		return fmt.Errorf("%w: at most %d days", ErrFinanceRangeTooLarge, maxDays)
	}
	return nil
}

// Days 区间内上海时区的日期列表（用于给没有数据的天补零）
func (r FinanceRange) Days() []string {
	days := make([]string, 0, 32)
	cursor := time.Unix(r.Start, 0).In(enterpriseBillingLocation)
	cursor = time.Date(cursor.Year(), cursor.Month(), cursor.Day(), 0, 0, 0, 0, enterpriseBillingLocation)
	end := time.Unix(r.EndExcl-1, 0).In(enterpriseBillingLocation)
	for !cursor.After(end) {
		days = append(days, cursor.Format("2006-01-02"))
		cursor = cursor.AddDate(0, 0, 1)
	}
	return days
}

// ---------------------------------------------------------------------------
// 倍率分布：同一 (分组, 模型) 在区间内可能出现多个倍率取值，主值取消费最大者，其余作为 shares 展示
// ---------------------------------------------------------------------------

// FinanceRatioShare 某个倍率取值及其对应的消费额
type FinanceRatioShare struct {
	Value float64 `json:"value"`
	Quota int64   `json:"quota"`
}

// FinanceRatioValue 倍率主值；Shares 仅在出现多个取值时下发
type FinanceRatioValue struct {
	Value  float64             `json:"value"`
	Shares []FinanceRatioShare `json:"shares,omitempty"`
}

// financeRatioMaxValues 单个维度记录的最大取值数，超过后忽略新取值（极端脏数据保护）
const financeRatioMaxValues = 32

type financeRatioAcc map[float64]int64

func (acc financeRatioAcc) add(value sql.NullFloat64, quota int64) {
	if !value.Valid {
		return
	}
	if _, exists := acc[value.Float64]; !exists && len(acc) >= financeRatioMaxValues {
		return
	}
	acc[value.Float64] += quota
}

// resolve 主值 = 消费最大的取值，消费相同取数值较小者；只有一个取值时不输出 shares
func (acc financeRatioAcc) resolve() *FinanceRatioValue {
	if len(acc) == 0 {
		return nil
	}
	shares := make([]FinanceRatioShare, 0, len(acc))
	for value, quota := range acc {
		shares = append(shares, FinanceRatioShare{Value: value, Quota: quota})
	}
	sort.Slice(shares, func(i, j int) bool {
		if shares[i].Quota != shares[j].Quota {
			return shares[i].Quota > shares[j].Quota
		}
		return shares[i].Value < shares[j].Value
	})
	result := &FinanceRatioValue{Value: shares[0].Value}
	if len(shares) > 1 {
		result.Shares = shares
	}
	return result
}

// FinanceRatios 一行汇总的全部倍率主值（nil 表示区间内没有该维度信息）
type FinanceRatios struct {
	ModelRatio           *FinanceRatioValue `json:"model_ratio"`
	GroupRatio           *FinanceRatioValue `json:"group_ratio"`
	GroupRatioExclusive  bool               `json:"group_ratio_exclusive"`
	CompletionRatio      *FinanceRatioValue `json:"completion_ratio"`
	CacheRatio           *FinanceRatioValue `json:"cache_ratio"`
	CacheCreationRatio   *FinanceRatioValue `json:"cache_creation_ratio"`
	CacheCreationRatio1h *FinanceRatioValue `json:"cache_creation_ratio_1h"`
	ModelPrice           *FinanceRatioValue `json:"model_price"`
}

// FinanceRatioScan 一条带倍率的扫描行（summary GROUP BY 的倍率列 / 明细行）。导出是因为 GORM 无法通过反射给未导出的内嵌结构体赋值
type FinanceRatioScan struct {
	ModelRatio           sql.NullFloat64
	GroupRatio           sql.NullFloat64
	GroupExclusive       bool
	CompletionRatio      sql.NullFloat64
	CacheRatio           sql.NullFloat64
	CacheCreationRatio   sql.NullFloat64
	CacheCreationRatio1h sql.NullFloat64 `gorm:"column:cache_creation_ratio_1h"`
	ModelPrice           sql.NullFloat64
}

// financeRatioAccumulator 按维度累加倍率取值；group_exclusive 跟随主值所属取值
type financeRatioAccumulator struct {
	modelRatio, groupRatio, completionRatio, cacheRatio, cacheCreationRatio, cacheCreationRatio1h, modelPrice financeRatioAcc
	groupExclusive                                                                                            map[float64]bool
}

func newFinanceRatioAccumulator() *financeRatioAccumulator {
	return &financeRatioAccumulator{
		modelRatio: financeRatioAcc{}, groupRatio: financeRatioAcc{}, completionRatio: financeRatioAcc{}, cacheRatio: financeRatioAcc{},
		cacheCreationRatio: financeRatioAcc{}, cacheCreationRatio1h: financeRatioAcc{}, modelPrice: financeRatioAcc{},
		groupExclusive: map[float64]bool{},
	}
}

func (a *financeRatioAccumulator) add(scan FinanceRatioScan, quota int64) {
	a.modelRatio.add(scan.ModelRatio, quota)
	a.groupRatio.add(scan.GroupRatio, quota)
	a.completionRatio.add(scan.CompletionRatio, quota)
	a.cacheRatio.add(scan.CacheRatio, quota)
	a.cacheCreationRatio.add(scan.CacheCreationRatio, quota)
	a.cacheCreationRatio1h.add(scan.CacheCreationRatio1h, quota)
	a.modelPrice.add(scan.ModelPrice, quota)
	if scan.GroupRatio.Valid && scan.GroupExclusive {
		a.groupExclusive[scan.GroupRatio.Float64] = true
	}
}

func (a *financeRatioAccumulator) resolve() FinanceRatios {
	ratios := FinanceRatios{
		ModelRatio:           a.modelRatio.resolve(),
		GroupRatio:           a.groupRatio.resolve(),
		CompletionRatio:      a.completionRatio.resolve(),
		CacheRatio:           a.cacheRatio.resolve(),
		CacheCreationRatio:   a.cacheCreationRatio.resolve(),
		CacheCreationRatio1h: a.cacheCreationRatio1h.resolve(),
		ModelPrice:           a.modelPrice.resolve(),
	}
	if ratios.GroupRatio != nil {
		ratios.GroupRatioExclusive = a.groupExclusive[ratios.GroupRatio.Value]
	}
	return ratios
}

// ---------------------------------------------------------------------------
// 单价（USD / 1M tokens）
// ---------------------------------------------------------------------------

// FinanceUnitPrices 按倍率快照换算的单价；按次计费或缺少对应倍率时为 null
type FinanceUnitPrices struct {
	Input        *float64 `json:"input"`
	CacheRead    *float64 `json:"cache_read"`
	CacheWrite5m *float64 `json:"cache_write_5m"`
	CacheWrite1h *float64 `json:"cache_write_1h"`
	Output       *float64 `json:"output"`
}

// financeUnitPricesFromRatios 输入单价 = model_ratio × group_ratio × (1e6 / QuotaPerUnit)，其余在输入单价上乘对应倍率
func financeUnitPricesFromRatios(modelRatio, groupRatio, completionRatio, cacheRatio, cacheCreationRatio, cacheCreationRatio1h, modelPrice sql.NullFloat64) FinanceUnitPrices {
	if modelPrice.Valid || !modelRatio.Valid || !groupRatio.Valid {
		return FinanceUnitPrices{}
	}
	input := modelRatio.Float64 * groupRatio.Float64 * (1_000_000 / common.QuotaPerUnit)
	prices := FinanceUnitPrices{Input: &input}
	multiply := func(ratio sql.NullFloat64) *float64 {
		if !ratio.Valid {
			return nil
		}
		value := input * ratio.Float64
		return &value
	}
	prices.CacheRead = multiply(cacheRatio)
	prices.CacheWrite5m = multiply(cacheCreationRatio)
	prices.CacheWrite1h = multiply(cacheCreationRatio1h)
	prices.Output = multiply(completionRatio)
	return prices
}

func (s FinanceRatioScan) unitPrices() FinanceUnitPrices {
	return financeUnitPricesFromRatios(s.ModelRatio, s.GroupRatio, s.CompletionRatio, s.CacheRatio, s.CacheCreationRatio, s.CacheCreationRatio1h, s.ModelPrice)
}

// UnitPrices 用倍率主值换算单价（汇总行）
func (r FinanceRatios) UnitPrices() FinanceUnitPrices {
	toNull := func(value *FinanceRatioValue) sql.NullFloat64 {
		if value == nil {
			return sql.NullFloat64{}
		}
		return sql.NullFloat64{Float64: value.Value, Valid: true}
	}
	return financeUnitPricesFromRatios(toNull(r.ModelRatio), toNull(r.GroupRatio), toNull(r.CompletionRatio), toNull(r.CacheRatio),
		toNull(r.CacheCreationRatio), toNull(r.CacheCreationRatio1h), toNull(r.ModelPrice))
}

// FinanceQuotaToUSD quota → USD 字符串（6 位小数），与账单口径一致
func FinanceQuotaToUSD(quota int64) string {
	return QuotaToUSD(quota).StringFixed(6)
}

// financePercentage part / total 的百分比，保留两位
func financePercentage(part int64, total int64) float64 {
	if total <= 0 {
		return 0
	}
	return float64(int64(float64(part)/float64(total)*10000+0.5)) / 100
}
