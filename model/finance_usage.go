package model

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/setting"
)

// 用量明细：按令牌分组 → 模型汇总、按天汇总、消费明细、导出。按单个用户 + 时间区间扫 logs（type=2）。
// 企业账单详情也走这里：user_id 取企业主账号，区间取账期。

// FinanceGroupModelRow 按（令牌分组, 模型）汇总的一行
type FinanceGroupModelRow struct {
	Group                 string            `json:"group"`
	GroupLabel            string            `json:"group_label"`
	ModelName             string            `json:"model_name"`
	Count                 int64             `json:"count"`
	PromptTokens          int64             `json:"prompt_tokens"`
	CompletionTokens      int64             `json:"completion_tokens"`
	InputTokens           int64             `json:"input_tokens"`
	CachedTokens          int64             `json:"cached_tokens"`
	CacheCreationTokens   int64             `json:"cache_creation_tokens"`
	CacheCreation1hTokens int64             `json:"cache_creation_1h_tokens"`
	Quota                 int64             `json:"quota"`
	AmountUSD             string            `json:"amount_usd"`
	Percentage            float64           `json:"percentage"`
	Ratios                FinanceRatios     `json:"ratios"`
	UnitPrices            FinanceUnitPrices `json:"unit_prices"`
}

// FinanceModelRow 跨分组按模型合并（CSV 用）
type FinanceModelRow struct {
	ModelName           string  `json:"model_name"`
	Calls               int64   `json:"calls"`
	PromptTokens        int64   `json:"prompt_tokens"`
	InputTokens         int64   `json:"input_tokens"`
	CachedTokens        int64   `json:"cached_tokens"`
	CacheCreationTokens int64   `json:"cache_creation_tokens"`
	CompletionTokens    int64   `json:"completion_tokens"`
	Quota               int64   `json:"quota"`
	AmountUSD           string  `json:"amount_usd"`
	Percentage          float64 `json:"percentage"`
}

// FinanceUsageSummary summary 接口返回
type FinanceUsageSummary struct {
	Period         FinanceRange            `json:"-"`
	TotalCalls     int64                   `json:"total_calls"`
	TotalQuota     int64                   `json:"total_quota"`
	TotalAmountUSD string                  `json:"total_amount_usd"`
	ByModel        []*FinanceModelRow      `json:"by_model"`
	ByGroupModel   []*FinanceGroupModelRow `json:"by_group_model"`
}

type financeGroupModelScan struct {
	FinanceRatioScan
	GroupName             string
	ModelName             string
	Calls                 int64
	PromptTokens          int64
	CompletionTokens      int64
	InputTokens           int64
	CachedTokens          int64
	CacheCreationTokens   int64
	CacheCreation1hTokens int64 `gorm:"column:cache_creation_1h_tokens"`
	Quota                 int64
}

// 聚合列（summary / daily 共用）
const financeUsageSumSQL = `COUNT(*) AS calls, SUM(l.prompt_tokens)::bigint AS prompt_tokens, SUM(l.completion_tokens)::bigint AS completion_tokens,
	SUM(e.input_tokens)::bigint AS input_tokens, SUM(d.cache_read)::bigint AS cached_tokens,
	SUM(d.cache_write)::bigint AS cache_creation_tokens, SUM(d.cache_write_1h)::bigint AS cache_creation_1h_tokens, SUM(l.quota)::bigint AS quota`

func financeUsageBase(userId int, r FinanceRange) string {
	return fmt.Sprintf("%s WHERE l.user_id = %d AND l.type = %d AND l.created_at >= %d AND l.created_at < %d", financeLogFromSQL, userId, LogTypeConsume, r.Start, r.EndExcl)
}

// ---------------------------------------------------------------------------
// summary（60 秒进程内缓存：同一用户同一区间的汇总与导出共用一次扫描）
// ---------------------------------------------------------------------------

const financeUsageCacheTTL = 60 * time.Second

type financeUsageCacheEntry struct {
	summary   *FinanceUsageSummary
	expiresAt time.Time
}

var financeUsageCache sync.Map // key: "userId:start:endExcl"

func financeUsageCacheSweep() {
	now := time.Now()
	financeUsageCache.Range(func(key, value any) bool {
		if now.After(value.(financeUsageCacheEntry).expiresAt) {
			financeUsageCache.Delete(key)
		}
		return true
	})
}

// GetFinanceUsageSummary 按（令牌分组, 模型）汇总，含倍率分布与单价
func GetFinanceUsageSummary(userId int, r FinanceRange) (*FinanceUsageSummary, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, err
	}
	key := fmt.Sprintf("%d:%d:%d", userId, r.Start, r.EndExcl)
	if cached, ok := financeUsageCache.Load(key); ok {
		entry := cached.(financeUsageCacheEntry)
		if time.Now().Before(entry.expiresAt) {
			return entry.summary, nil
		}
	}
	summary, err := aggregateFinanceUsage(userId, r)
	if err != nil {
		return nil, err
	}
	financeUsageCacheSweep()
	financeUsageCache.Store(key, financeUsageCacheEntry{summary: summary, expiresAt: time.Now().Add(financeUsageCacheTTL)})
	return summary, nil
}

func aggregateFinanceUsage(userId int, r FinanceRange) (*FinanceUsageSummary, error) {
	// 倍率列进 GROUP BY：分组数 ≈ (分组 × 模型) × 少量倍率取值，远小于日志行数；jsonb 解析只在 PG 侧发生一次
	query := fmt.Sprintf(`SELECT l.%s AS group_name, l.model_name,
	d.model_ratio, d.group_ratio, d.group_exclusive, d.completion_ratio, d.cache_ratio, d.cache_creation_ratio, d.cache_creation_ratio_1h, d.model_price,
	%s
	%s
	GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10`, logGroupCol, financeUsageSumSQL, financeUsageBase(userId, r))
	scans := make([]financeGroupModelScan, 0)
	if err := LOG_DB.Raw(query).Scan(&scans).Error; err != nil {
		return nil, err
	}

	type groupModelKey struct{ group, model string }
	rows := make(map[groupModelKey]*FinanceGroupModelRow)
	accumulators := make(map[groupModelKey]*financeRatioAccumulator)
	order := make([]groupModelKey, 0)
	summary := &FinanceUsageSummary{Period: r, ByModel: []*FinanceModelRow{}, ByGroupModel: []*FinanceGroupModelRow{}}
	for _, scan := range scans {
		key := groupModelKey{scan.GroupName, scan.ModelName}
		row, exists := rows[key]
		if !exists {
			row = &FinanceGroupModelRow{Group: scan.GroupName, GroupLabel: setting.GetUsableGroupDescription(scan.GroupName), ModelName: scan.ModelName}
			rows[key] = row
			accumulators[key] = newFinanceRatioAccumulator()
			order = append(order, key)
		}
		row.Count += scan.Calls
		row.PromptTokens += scan.PromptTokens
		row.CompletionTokens += scan.CompletionTokens
		row.InputTokens += scan.InputTokens
		row.CachedTokens += scan.CachedTokens
		row.CacheCreationTokens += scan.CacheCreationTokens
		row.CacheCreation1hTokens += scan.CacheCreation1hTokens
		row.Quota += scan.Quota
		accumulators[key].add(scan.FinanceRatioScan, scan.Quota)
		summary.TotalCalls += scan.Calls
		summary.TotalQuota += scan.Quota
	}
	summary.TotalAmountUSD = FinanceQuotaToUSD(summary.TotalQuota)

	byModel := make(map[string]*FinanceModelRow)
	for _, key := range order {
		row := rows[key]
		row.Ratios = accumulators[key].resolve()
		row.UnitPrices = row.Ratios.UnitPrices()
		row.AmountUSD = FinanceQuotaToUSD(row.Quota)
		row.Percentage = financePercentage(row.Quota, summary.TotalQuota)
		summary.ByGroupModel = append(summary.ByGroupModel, row)

		model, exists := byModel[row.ModelName]
		if !exists {
			model = &FinanceModelRow{ModelName: row.ModelName}
			byModel[row.ModelName] = model
			summary.ByModel = append(summary.ByModel, model)
		}
		model.Calls += row.Count
		model.PromptTokens += row.PromptTokens
		model.InputTokens += row.InputTokens
		model.CachedTokens += row.CachedTokens
		model.CacheCreationTokens += row.CacheCreationTokens
		model.CompletionTokens += row.CompletionTokens
		model.Quota += row.Quota
	}
	for _, model := range summary.ByModel {
		model.AmountUSD = FinanceQuotaToUSD(model.Quota)
		model.Percentage = financePercentage(model.Quota, summary.TotalQuota)
	}
	sort.SliceStable(summary.ByGroupModel, func(i, j int) bool {
		a, b := summary.ByGroupModel[i], summary.ByGroupModel[j]
		if a.Group != b.Group {
			return a.Group < b.Group
		}
		return a.Quota > b.Quota
	})
	sort.SliceStable(summary.ByModel, func(i, j int) bool { return summary.ByModel[i].Quota > summary.ByModel[j].Quota })
	return summary, nil
}

// FoldFinanceModelRatios 把按（令牌分组, 模型）的汇总跨分组折叠成按模型：token 与金额相加，倍率分布合并后重新取主值，
// 单价按合并后的主值换算。返回行的 Group / GroupLabel 为空，形状与分组-模型行一致（账单快照、Invoice 共用）
func FoldFinanceModelRatios(rows []*FinanceGroupModelRow, totalQuota int64) []*FinanceGroupModelRow {
	folded := make([]*FinanceGroupModelRow, 0)
	byModel := make(map[string]*FinanceGroupModelRow)
	accumulators := make(map[string]*financeRatioAccumulator)
	for _, row := range rows {
		model, exists := byModel[row.ModelName]
		if !exists {
			model = &FinanceGroupModelRow{ModelName: row.ModelName}
			byModel[row.ModelName] = model
			accumulators[row.ModelName] = newFinanceRatioAccumulator()
			folded = append(folded, model)
		}
		model.Count += row.Count
		model.PromptTokens += row.PromptTokens
		model.CompletionTokens += row.CompletionTokens
		model.InputTokens += row.InputTokens
		model.CachedTokens += row.CachedTokens
		model.CacheCreationTokens += row.CacheCreationTokens
		model.CacheCreation1hTokens += row.CacheCreation1hTokens
		model.Quota += row.Quota
		accumulators[row.ModelName].addResolved(row.Ratios, row.Quota)
	}
	for _, model := range folded {
		model.Ratios = accumulators[model.ModelName].resolve()
		model.UnitPrices = model.Ratios.UnitPrices()
		model.AmountUSD = FinanceQuotaToUSD(model.Quota)
		model.Percentage = financePercentage(model.Quota, totalQuota)
	}
	sort.SliceStable(folded, func(i, j int) bool { return folded[i].Quota > folded[j].Quota })
	return folded
}

// ---------------------------------------------------------------------------
// daily
// ---------------------------------------------------------------------------

// FinanceDailyRow 按天汇总一行
type FinanceDailyRow struct {
	Day                 string  `json:"day"`
	Calls               int64   `json:"calls"`
	PromptTokens        int64   `json:"prompt_tokens"`
	InputTokens         int64   `json:"input_tokens"`
	CachedTokens        int64   `json:"cached_tokens"`
	CacheCreationTokens int64   `json:"cache_creation_tokens"`
	CompletionTokens    int64   `json:"completion_tokens"`
	Quota               int64   `json:"quota"`
	AmountUSD           string  `json:"amount_usd"`
	Percentage          float64 `json:"percentage"`
}

// FinanceUsageDaily daily 接口返回
type FinanceUsageDaily struct {
	TotalCalls     int64              `json:"total_calls"`
	TotalQuota     int64              `json:"total_quota"`
	TotalAmountUSD string             `json:"total_amount_usd"`
	ByDay          []*FinanceDailyRow `json:"by_day"`
}

type financeDailyScan struct {
	Day                   string
	Calls                 int64
	PromptTokens          int64
	CompletionTokens      int64
	InputTokens           int64
	CachedTokens          int64
	CacheCreationTokens   int64
	CacheCreation1hTokens int64 `gorm:"column:cache_creation_1h_tokens"`
	Quota                 int64
}

// GetFinanceUsageDaily 按天汇总（上海时区日界），只含有消费的天
func GetFinanceUsageDaily(userId int, r FinanceRange) (*FinanceUsageDaily, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, err
	}
	query := fmt.Sprintf("SELECT %s AS day, %s %s GROUP BY 1 ORDER BY 1", financeDayBucketSQL, financeUsageSumSQL, financeUsageBase(userId, r))
	scans := make([]financeDailyScan, 0)
	if err := LOG_DB.Raw(query).Scan(&scans).Error; err != nil {
		return nil, err
	}
	result := &FinanceUsageDaily{ByDay: make([]*FinanceDailyRow, 0, len(scans))}
	for _, scan := range scans {
		result.TotalCalls += scan.Calls
		result.TotalQuota += scan.Quota
		result.ByDay = append(result.ByDay, &FinanceDailyRow{
			Day: scan.Day, Calls: scan.Calls, PromptTokens: scan.PromptTokens, InputTokens: scan.InputTokens, CachedTokens: scan.CachedTokens,
			CacheCreationTokens: scan.CacheCreationTokens, CompletionTokens: scan.CompletionTokens, Quota: scan.Quota, AmountUSD: FinanceQuotaToUSD(scan.Quota),
		})
	}
	result.TotalAmountUSD = FinanceQuotaToUSD(result.TotalQuota)
	for _, row := range result.ByDay {
		row.Percentage = financePercentage(row.Quota, result.TotalQuota)
	}
	return result, nil
}

// ---------------------------------------------------------------------------
// detail / export
// ---------------------------------------------------------------------------

// FinanceUsageDetailRow 消费明细一行
type FinanceUsageDetailRow struct {
	CreatedAt             int64             `json:"created_at"`
	ModelName             string            `json:"model_name"`
	TokenName             string            `json:"token_name"`
	Group                 string            `json:"group"`
	PromptTokens          int64             `json:"prompt_tokens"`
	InputTokens           int64             `json:"input_tokens"`
	CachedTokens          int64             `json:"cached_tokens"`
	CacheCreationTokens   int64             `json:"cache_creation_tokens"`
	CacheCreation1hTokens int64             `json:"cache_creation_1h_tokens"`
	CompletionTokens      int64             `json:"completion_tokens"`
	Quota                 int64             `json:"quota"`
	AmountUSD             string            `json:"amount_usd"`
	UnitPrices            FinanceUnitPrices `json:"unit_prices"`
	ModelRatio            *float64          `json:"model_ratio"`
	GroupRatio            *float64          `json:"group_ratio"`
}

type financeDetailScan struct {
	FinanceRatioScan
	CreatedAt             int64
	ModelName             string
	TokenName             string
	GroupName             string
	PromptTokens          int64
	CompletionTokens      int64
	InputTokens           int64
	CachedTokens          int64
	CacheCreationTokens   int64
	CacheCreation1hTokens int64 `gorm:"column:cache_creation_1h_tokens"`
	Quota                 int64
}

// FinanceUsageExportMaxRows 导出明细上限
const FinanceUsageExportMaxRows = 200000

func financeDetailSelectSQL(userId int, r FinanceRange) string {
	return fmt.Sprintf(`SELECT l.created_at, l.model_name, l.token_name, l.%s AS group_name, l.prompt_tokens::bigint AS prompt_tokens, l.completion_tokens::bigint AS completion_tokens,
	e.input_tokens, d.cache_read AS cached_tokens, d.cache_write AS cache_creation_tokens, d.cache_write_1h AS cache_creation_1h_tokens, l.quota::bigint AS quota,
	d.model_ratio, d.group_ratio, d.group_exclusive, d.completion_ratio, d.cache_ratio, d.cache_creation_ratio, d.cache_creation_ratio_1h, d.model_price
	%s ORDER BY l.created_at DESC, l.id DESC`, logGroupCol, financeUsageBase(userId, r))
}

func financeDetailRows(scans []financeDetailScan) []*FinanceUsageDetailRow {
	rows := make([]*FinanceUsageDetailRow, 0, len(scans))
	for _, scan := range scans {
		row := &FinanceUsageDetailRow{
			CreatedAt: scan.CreatedAt, ModelName: scan.ModelName, TokenName: scan.TokenName, Group: scan.GroupName,
			PromptTokens: scan.PromptTokens, InputTokens: scan.InputTokens, CachedTokens: scan.CachedTokens,
			CacheCreationTokens: scan.CacheCreationTokens, CacheCreation1hTokens: scan.CacheCreation1hTokens, CompletionTokens: scan.CompletionTokens,
			Quota: scan.Quota, AmountUSD: FinanceQuotaToUSD(scan.Quota), UnitPrices: scan.unitPrices(),
		}
		if scan.ModelRatio.Valid {
			row.ModelRatio = &scan.ModelRatio.Float64
		}
		if scan.GroupRatio.Valid {
			row.GroupRatio = &scan.GroupRatio.Float64
		}
		rows = append(rows, row)
	}
	return rows
}

// ListFinanceUsageDetail 消费明细，偏移分页，时间倒序
func ListFinanceUsageDetail(userId int, r FinanceRange, startIdx int, num int) ([]*FinanceUsageDetailRow, int64, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, 0, err
	}
	var total int64
	if err := LOG_DB.Model(&Log{}).Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeConsume, r.Start, r.EndExcl).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	scans := make([]financeDetailScan, 0)
	if err := LOG_DB.Raw(fmt.Sprintf("%s LIMIT %d OFFSET %d", financeDetailSelectSQL(userId, r), num, startIdx)).Scan(&scans).Error; err != nil {
		return nil, 0, err
	}
	return financeDetailRows(scans), total, nil
}

// ListFinanceUsageForExport 导出用全量明细；超过上限直接报错而不是截断
func ListFinanceUsageForExport(userId int, r FinanceRange) ([]*FinanceUsageDetailRow, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, err
	}
	var total int64
	if err := LOG_DB.Model(&Log{}).Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userId, LogTypeConsume, r.Start, r.EndExcl).Count(&total).Error; err != nil {
		return nil, err
	}
	if total > FinanceUsageExportMaxRows {
		return nil, fmt.Errorf("too many rows to export: %d (max %d)", total, FinanceUsageExportMaxRows)
	}
	scans := make([]financeDetailScan, 0)
	if err := LOG_DB.Raw(financeDetailSelectSQL(userId, r)).Scan(&scans).Error; err != nil {
		return nil, err
	}
	return financeDetailRows(scans), nil
}
