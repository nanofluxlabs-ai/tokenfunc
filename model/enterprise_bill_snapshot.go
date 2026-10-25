package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
)

// 账单用量快照 v2（TokenFunc 二开，仅 PostgreSQL）。出账时把财务中心口径的聚合冻结进 ent_bills.usage_snapshot：
//   - by_group_model：按令牌分组 × 模型，含输入 / 缓存命中 / 缓存写入(5m / 1h) / 输出 token、倍率分布与单价四列（USD / 1M）；
//   - by_model：跨分组按模型折叠（倍率分布合并后取主值）；
//   - by_day：按天；
//   - logs_total_quota / logs_total_calls：logs 合计，和账单金额（账期计数器）的差即在途尾差。
// 归因块 by_team / by_member 与对账字段 detail_total_quota 仍来自 ent_usage_daily，和 v1 一样写在同一个 jsonb 里；
// 旧快照（无 snapshot_version）前端按 v1 兼容渲染，不回填。
// 财务聚合要扫 logs，必须在出账事务之外只读执行；聚合失败只记日志、快照退回 v1 字段，不阻塞出账。

// EnterpriseBillSnapshotVersion 当前出账写入的快照版本
const EnterpriseBillSnapshotVersion = 2

// EnterpriseBillUsageSnapshot usage_snapshot 的 v2 财务块
type EnterpriseBillUsageSnapshot struct {
	SnapshotVersion int                     `json:"snapshot_version"`
	LogsTotalCalls  int64                   `json:"logs_total_calls"`
	LogsTotalQuota  int64                   `json:"logs_total_quota"`
	ByGroupModel    []*FinanceGroupModelRow `json:"by_group_model"`
	ByModel         []*FinanceGroupModelRow `json:"by_model"`
	ByDay           []*FinanceDailyRow      `json:"by_day"`
}

// buildEnterpriseBillUsageSnapshot 在事务外按企业主账号 + 区间聚合 logs。绕过 60 秒汇总缓存：账期刚结束时
// 缓存里可能是在途结算落地前的旧值，出账快照必须用最新数据
func buildEnterpriseBillUsageSnapshot(userId int, r FinanceRange) (*EnterpriseBillUsageSnapshot, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, err
	}
	if LOG_DB == nil {
		return nil, ErrFinanceRequiresPostgres
	}
	summary, err := aggregateFinanceUsage(userId, r)
	if err != nil {
		return nil, err
	}
	daily, err := GetFinanceUsageDaily(userId, r)
	if err != nil {
		return nil, err
	}
	return &EnterpriseBillUsageSnapshot{
		SnapshotVersion: EnterpriseBillSnapshotVersion,
		LogsTotalCalls:  summary.TotalCalls,
		LogsTotalQuota:  summary.TotalQuota,
		ByGroupModel:    summary.ByGroupModel,
		ByModel:         FoldFinanceModelRatios(summary.ByGroupModel, summary.TotalQuota),
		ByDay:           daily.ByDay,
	}, nil
}

// snapshotEnterpriseBillUsage 出账前的只读聚合入口：失败只记日志并返回 nil，由调用方写 v1 快照
func snapshotEnterpriseBillUsage(enterpriseId int, start int64, endExcl int64) *EnterpriseBillUsageSnapshot {
	enterprise, err := GetEnterpriseById(enterpriseId)
	if err != nil {
		common.SysError(fmt.Sprintf("bill snapshot: load enterprise %d failed, falling back to v1: %s", enterpriseId, err.Error()))
		return nil
	}
	snapshot, err := buildEnterpriseBillUsageSnapshot(enterprise.UserId, FinanceRange{Start: start, EndExcl: endExcl})
	if err != nil {
		common.SysError(fmt.Sprintf("bill snapshot: aggregate logs for enterprise %d failed, falling back to v1: %s", enterpriseId, err.Error()))
		return nil
	}
	return snapshot
}

// mergeInto 把 v2 财务块写进快照 map；by_model 覆盖 ent_usage_daily 口径的同名块。nil 接收者不做任何事
func (s *EnterpriseBillUsageSnapshot) mergeInto(snapshot map[string]any) {
	if s == nil {
		return
	}
	snapshot["snapshot_version"] = s.SnapshotVersion
	snapshot["logs_total_calls"] = s.LogsTotalCalls
	snapshot["logs_total_quota"] = s.LogsTotalQuota
	snapshot["by_group_model"] = s.ByGroupModel
	snapshot["by_model"] = s.ByModel
	snapshot["by_day"] = s.ByDay
}

// UsageSnapshotV2 解析账单上的 v2 财务块；旧快照或解析失败返回 nil
func (b *EnterpriseBill) UsageSnapshotV2() *EnterpriseBillUsageSnapshot {
	if len(b.UsageSnapshot) == 0 {
		return nil
	}
	var snapshot EnterpriseBillUsageSnapshot
	if err := common.Unmarshal(b.UsageSnapshot, &snapshot); err != nil || snapshot.SnapshotVersion < EnterpriseBillSnapshotVersion {
		return nil
	}
	if snapshot.ByGroupModel == nil {
		snapshot.ByGroupModel = []*FinanceGroupModelRow{}
	}
	if snapshot.ByModel == nil {
		snapshot.ByModel = []*FinanceGroupModelRow{}
	}
	if snapshot.ByDay == nil {
		snapshot.ByDay = []*FinanceDailyRow{}
	}
	return &snapshot
}

// FinanceSummary 把快照还原成财务汇总，CSV 导出复用 service.WriteFinanceUsageCSV，与账单详情页同口径
func (s *EnterpriseBillUsageSnapshot) FinanceSummary() *FinanceUsageSummary {
	summary := &FinanceUsageSummary{
		TotalCalls: s.LogsTotalCalls, TotalQuota: s.LogsTotalQuota, TotalAmountUSD: FinanceQuotaToUSD(s.LogsTotalQuota),
		ByModel: make([]*FinanceModelRow, 0, len(s.ByModel)), ByGroupModel: s.ByGroupModel,
	}
	for _, row := range s.ByModel {
		summary.ByModel = append(summary.ByModel, &FinanceModelRow{
			ModelName: row.ModelName, Calls: row.Count, PromptTokens: row.PromptTokens, InputTokens: row.InputTokens, CachedTokens: row.CachedTokens,
			CacheCreationTokens: row.CacheCreationTokens, CompletionTokens: row.CompletionTokens, Quota: row.Quota, AmountUSD: row.AmountUSD, Percentage: row.Percentage,
		})
	}
	return summary
}

// FinanceDaily 把快照的按天块还原成财务按天汇总
func (s *EnterpriseBillUsageSnapshot) FinanceDaily() *FinanceUsageDaily {
	return &FinanceUsageDaily{TotalCalls: s.LogsTotalCalls, TotalQuota: s.LogsTotalQuota, TotalAmountUSD: FinanceQuotaToUSD(s.LogsTotalQuota), ByDay: s.ByDay}
}

// WithLiveUsageSnapshot 旧快照（无 v2 财务块）的账单在账期 logs 未清理时按当前 logs 现算 v2 块，只改返回值不落库，
// 与管理员财务中心对旧账单的实时口径一致；logs 已清理、聚合失败或非 PG 时原样返回
func (b *EnterpriseBill) WithLiveUsageSnapshot() *EnterpriseBill {
	if b.UsageSnapshotV2() != nil || len(b.UsageSnapshot) == 0 {
		return b
	}
	if purged, err := BillPeriodLogsPurged(b); err != nil || purged {
		return b
	}
	enterprise, err := GetEnterpriseById(b.EnterpriseId)
	if err != nil {
		return b
	}
	live, err := buildEnterpriseBillUsageSnapshot(enterprise.UserId, FinanceRange{Start: b.PeriodStart, EndExcl: b.PeriodEnd})
	if err != nil {
		return b
	}
	var snapshot map[string]any
	if err := common.Unmarshal(b.UsageSnapshot, &snapshot); err != nil || snapshot == nil {
		return b
	}
	live.mergeInto(snapshot)
	snapshot["snapshot_source"] = FinanceUsageSourceLive
	raw, err := common.Marshal(snapshot)
	if err != nil {
		return b
	}
	result := *b
	result.UsageSnapshot = JSONValue(raw)
	return &result
}
