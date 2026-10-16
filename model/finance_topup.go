package model

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// 个人财务对账·充值账单（TokenFunc 二开，PG-only）：钱包的非消费流水，满足 期末余额 = 期初 + Σ本账单 − Σ消费账单。
// 上游写充值 / 调额日志时不写 quota，金额不能从 logs 取，按来源回到各自的事实表：
//   - online：top_ups 成功单（含管理员补单与管理员手动充值 provider=admin，remark 取参考号），额度推导复用订单中心的 financeOrderItem；订阅镜像行用 NOT EXISTS 剔除
//   - redemption：redemptions.used_user_id（兑换后被删除的码也算，raw SQL 不受软删影响）
//   - enterprise_topup：ent_ledger.topup（预付企业主的线下充值；credit 模式的 adjustment 不动钱包，不算）
//   - subscription_balance：余额购买订阅，钱包扣减记负数
//   - admin_adjust：logs type=1 且 other.op.action = user.quota_*，金额 = to − from（可负）
//   - refund：logs type=6（任务退款 / 差额结算退回）
// 在线支付的订阅不动钱包，不在此视图；注册 / 邀请 / 签到赠送上游只写文案不写数值，暂不纳入。
// logs 走 LOG_DB，其余走 DB，两边各查一次后在 Go 内合并排序、内存分页。

const (
	FinanceTopupSourceOnline              = "online"
	FinanceTopupSourceRedemption          = "redemption"
	FinanceTopupSourceEnterpriseTopup     = "enterprise_topup"
	FinanceTopupSourceSubscriptionBalance = "subscription_balance"
	FinanceTopupSourceAdminAdjust         = "admin_adjust"
	FinanceTopupSourceRefund              = "refund"

	FinanceTopupTypeTopup        = "topup"
	FinanceTopupTypeAdjust       = "adjust"
	FinanceTopupTypeRefund       = "refund"
	FinanceTopupTypeSubscription = "subscription"

	// FinanceTopupMaxRows 单次区间内任一数据源的流水行数上限；超过直接报错让用户缩小区间
	FinanceTopupMaxRows = 50000

	financeAdminQuotaActionPrefix = "user.quota_"
)

// FinanceTopupEntry 一条钱包流水
type FinanceTopupEntry struct {
	Id            string `json:"id"`
	CreatedAt     int64  `json:"created_at"`
	Type          string `json:"type"`
	Source        string `json:"source"`
	PaymentMethod string `json:"payment_method"`
	Quota         int64  `json:"quota"`
	AmountUSD     string `json:"amount_usd"`
	RefNo         string `json:"ref_no"`
	Content       string `json:"content"`
}

// FinanceTopupSourceRow 按 (类型, 来源, 支付方式) 汇总的一行
type FinanceTopupSourceRow struct {
	Type          string  `json:"type"`
	Source        string  `json:"source"`
	PaymentMethod string  `json:"payment_method"`
	Count         int64   `json:"count"`
	Quota         int64   `json:"quota"`
	AmountUSD     string  `json:"amount_usd"`
	Percentage    float64 `json:"percentage"`
}

type FinanceTopupSummary struct {
	TotalEntries   int64                   `json:"total_entries"`
	TotalQuota     int64                   `json:"total_quota"`
	TotalAmountUSD string                  `json:"total_amount_usd"`
	BySource       []FinanceTopupSourceRow `json:"by_source"`
}

// FinanceTopupTypeOf 来源 → 类型
func FinanceTopupTypeOf(source string) string {
	switch source {
	case FinanceTopupSourceAdminAdjust:
		return FinanceTopupTypeAdjust
	case FinanceTopupSourceRefund:
		return FinanceTopupTypeRefund
	case FinanceTopupSourceSubscriptionBalance:
		return FinanceTopupTypeSubscription
	default:
		return FinanceTopupTypeTopup
	}
}

// 主库四类来源的 UNION；列顺序与 financeTopupMainScan 一致，整型统一成 bigint 以免 UNION 类型不匹配
const financeTopupMainSQL = `SELECT 'online' AS source, t.id::bigint AS source_id, t.complete_time AS created_at, t.payment_method, t.payment_provider,
	t.amount::bigint AS amount, t.money, 0::bigint AS quota, t.trade_no AS ref_no, t.reference AS remark, '' AS payload
FROM top_ups t
WHERE t.user_id = @uid AND t.status = @success AND t.complete_time >= @start AND t.complete_time < @end
	AND NOT EXISTS (SELECT 1 FROM subscription_orders s WHERE s.trade_no = t.trade_no)
UNION ALL
SELECT 'redemption', r.id::bigint, r.redeemed_time, '', '', 0::bigint, 0::double precision, r.quota::bigint, r.name, '', ''
FROM redemptions r
WHERE r.used_user_id = @uid AND r.redeemed_time >= @start AND r.redeemed_time < @end
UNION ALL
SELECT 'enterprise_topup', l.id, l.created_at, '', '', 0::bigint, 0::double precision, l.amount_quota, l.reference, l.remark, ''
FROM ent_ledger l JOIN enterprises e ON e.id = l.enterprise_id
WHERE e.user_id = @uid AND l.type = 'topup' AND l.created_at >= @start AND l.created_at < @end
UNION ALL
SELECT 'subscription_balance', s.id::bigint, s.complete_time, s.payment_method, s.payment_provider, 0::bigint, s.money, 0::bigint, s.trade_no, COALESCE(p.title, ''), COALESCE(s.provider_payload, '')
FROM subscription_orders s LEFT JOIN subscription_plans p ON p.id = s.plan_id
WHERE s.user_id = @uid AND s.status = @success AND s.payment_method = 'balance' AND s.complete_time >= @start AND s.complete_time < @end
ORDER BY created_at DESC, source_id DESC
LIMIT @limit`

type financeTopupMainScan struct {
	Source          string
	SourceId        int64
	CreatedAt       int64
	PaymentMethod   string
	PaymentProvider string
	Amount          int64
	Money           float64
	Quota           int64
	RefNo           string
	Remark          string
	Payload         string
}

type financeTopupLogScan struct {
	Id        int
	CreatedAt int64
	Type      int
	Quota     int
	Content   string
	Other     string
}

// ListFinanceTopupEntries 区间内本人全部钱包流水，时间倒序
func ListFinanceTopupEntries(userId int, r FinanceRange) ([]FinanceTopupEntry, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, err
	}
	mainScans := make([]financeTopupMainScan, 0)
	args := map[string]any{"uid": userId, "success": common.TopUpStatusSuccess, "start": r.Start, "end": r.EndExcl, "limit": FinanceTopupMaxRows + 1}
	if err := DB.Raw(financeTopupMainSQL, args).Scan(&mainScans).Error; err != nil {
		return nil, err
	}
	logScans := make([]financeTopupLogScan, 0)
	err := LOG_DB.Model(&Log{}).Select("id, created_at, type, quota, content, other").
		Where("user_id = ? AND created_at >= ? AND created_at < ? AND ((type = ? AND quota > 0) OR (type = ? AND other LIKE ?))",
			userId, r.Start, r.EndExcl, LogTypeRefund, LogTypeTopup, `%"op"%`).
		Order("created_at DESC, id DESC").Limit(FinanceTopupMaxRows + 1).Scan(&logScans).Error
	if err != nil {
		return nil, err
	}
	if len(mainScans) > FinanceTopupMaxRows || len(logScans) > FinanceTopupMaxRows {
		return nil, fmt.Errorf("too many rows: more than %d entries in range", FinanceTopupMaxRows)
	}

	entries := make([]FinanceTopupEntry, 0, len(mainScans)+len(logScans))
	for _, scan := range mainScans {
		entries = append(entries, financeTopupMainEntry(scan))
	}
	for _, scan := range logScans {
		if entry, ok := financeTopupLogEntry(scan); ok {
			entries = append(entries, entry)
		}
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].CreatedAt != entries[j].CreatedAt {
			return entries[i].CreatedAt > entries[j].CreatedAt
		}
		return entries[i].Id > entries[j].Id
	})
	for i := range entries {
		entries[i].Type = FinanceTopupTypeOf(entries[i].Source)
		entries[i].AmountUSD = FinanceQuotaToUSD(entries[i].Quota)
	}
	return entries, nil
}

func financeTopupMainEntry(scan financeTopupMainScan) FinanceTopupEntry {
	entry := FinanceTopupEntry{
		Id: fmt.Sprintf("%s:%d", scan.Source, scan.SourceId), CreatedAt: scan.CreatedAt, Source: scan.Source,
		PaymentMethod: scan.PaymentMethod, Quota: scan.Quota, RefNo: scan.RefNo, Content: scan.Remark,
	}
	switch scan.Source {
	case FinanceTopupSourceOnline:
		order := financeOrderItem(financeOrderScan{OrderType: FinanceOrderTypeWalletTopup, PaymentMethod: scan.PaymentMethod, PaymentProvider: scan.PaymentProvider, Amount: scan.Amount, Money: scan.Money})
		entry.Quota = order.CreditAmount
		if scan.PaymentProvider != "" && scan.PaymentProvider != scan.PaymentMethod {
			entry.PaymentMethod = scan.PaymentProvider + "/" + scan.PaymentMethod
		}
	case FinanceTopupSourceSubscriptionBalance:
		// 写入侧把实际扣减额度放在 provider_payload（charged_quota=N）；缺失时按套餐价重算
		entry.Quota = -financeSubscriptionChargedQuota(scan.Payload, scan.Money)
		entry.PaymentMethod = ""
	}
	return entry
}

func financeSubscriptionChargedQuota(payload string, money float64) int64 {
	if value, ok := strings.CutPrefix(payload, "charged_quota="); ok {
		if quota, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64); err == nil {
			return quota
		}
	}
	quota, err := calcSubscriptionBalanceQuota(money)
	if err != nil {
		return 0
	}
	return int64(quota)
}

// financeTopupLogEntry 从日志行还原流水：退款直接取 quota；管理员调额从 other.op.params 的 from / to 算差额
func financeTopupLogEntry(scan financeTopupLogScan) (FinanceTopupEntry, bool) {
	entry := FinanceTopupEntry{Id: fmt.Sprintf("log:%d", scan.Id), CreatedAt: scan.CreatedAt, Content: scan.Content}
	if scan.Type == LogTypeRefund {
		entry.Source = FinanceTopupSourceRefund
		entry.Quota = int64(scan.Quota)
		var other struct {
			TaskId string `json:"task_id"`
			Reason string `json:"reason"`
		}
		if strings.HasPrefix(scan.Other, "{") && common.UnmarshalJsonStr(scan.Other, &other) == nil {
			entry.RefNo = other.TaskId
			if entry.Content == "" {
				entry.Content = other.Reason
			}
		}
		return entry, true
	}
	var other AuditOther
	if !strings.HasPrefix(scan.Other, "{") || common.UnmarshalJsonStr(scan.Other, &other) != nil || other.Op == nil || !strings.HasPrefix(other.Op.Action, financeAdminQuotaActionPrefix) {
		return entry, false
	}
	from, okFrom := financeAuditInt(other.Op.Params, "from")
	to, okTo := financeAuditInt(other.Op.Params, "to")
	if !okFrom || !okTo {
		return entry, false
	}
	entry.Source = FinanceTopupSourceAdminAdjust
	entry.Quota = to - from
	entry.RefNo = strings.TrimPrefix(other.Op.Action, financeAdminQuotaActionPrefix)
	return entry, true
}

// financeAuditInt AuditFields 反序列化后值是 json.RawMessage，按整数解析
func financeAuditInt(fields AuditFields, key string) (int64, bool) {
	raw, ok := fields[key].(json.RawMessage)
	if !ok {
		return 0, false
	}
	var value int64
	if err := common.Unmarshal(raw, &value); err != nil {
		return 0, false
	}
	return value, true
}

// SummarizeFinanceTopup 按 (类型, 来源, 支付方式) 汇总，按金额倒序
func SummarizeFinanceTopup(entries []FinanceTopupEntry) FinanceTopupSummary {
	summary := FinanceTopupSummary{TotalEntries: int64(len(entries)), BySource: make([]FinanceTopupSourceRow, 0)}
	index := make(map[string]int)
	for _, entry := range entries {
		summary.TotalQuota += entry.Quota
		key := entry.Source + "|" + entry.PaymentMethod
		position, exists := index[key]
		if !exists {
			position = len(summary.BySource)
			index[key] = position
			summary.BySource = append(summary.BySource, FinanceTopupSourceRow{Type: entry.Type, Source: entry.Source, PaymentMethod: entry.PaymentMethod})
		}
		summary.BySource[position].Count++
		summary.BySource[position].Quota += entry.Quota
	}
	summary.TotalAmountUSD = FinanceQuotaToUSD(summary.TotalQuota)
	for i := range summary.BySource {
		summary.BySource[i].AmountUSD = FinanceQuotaToUSD(summary.BySource[i].Quota)
		summary.BySource[i].Percentage = financePercentage(summary.BySource[i].Quota, summary.TotalQuota)
	}
	sort.SliceStable(summary.BySource, func(i, j int) bool { return summary.BySource[i].Quota > summary.BySource[j].Quota })
	return summary
}
