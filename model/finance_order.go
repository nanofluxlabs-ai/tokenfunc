package model

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"gorm.io/gorm"
)

// 订单视图：top_ups ∪ subscription_orders。不建统一订单表、不改上游写入点，查询时合并。
// 在线支付订阅完成时上游会向 top_ups 写一条同 trade_no 的镜像行（Amount=0），这里用 NOT EXISTS 剔除。
// 兑换码、管理员调额不是订单，不在此视图内；管理员手动充值写 top_ups（provider=admin），算订单——企业主的线下充值也走这条路，
// 同一事务再写一条 ent_ledger.topup（remark 为订单号），所以企业充值同时出现在订单中心与企业台账。

const (
	FinanceOrderTypeWalletTopup  = "wallet_topup"
	FinanceOrderTypeSubscription = "subscription_purchase"

	// 线下渠道之外的支付方式都会落到 top_ups.payment_provider；易支付的 provider 为 epay，method 为 alipay / wxpay 等
	financeCurrencyUSD = "USD"
	financeCurrencyCNY = "CNY"
)

const financeOrdersUnionSQL = `SELECT 'wallet_topup' AS order_type, t.id AS source_id, t.user_id, t.trade_no, t.payment_method, t.payment_provider, t.status,
	t.amount, t.money, 0 AS plan_id, t.create_time, t.complete_time, t.reference
FROM top_ups t
WHERE NOT EXISTS (SELECT 1 FROM subscription_orders s WHERE s.trade_no = t.trade_no)
UNION ALL
SELECT 'subscription_purchase' AS order_type, s.id AS source_id, s.user_id, s.trade_no, s.payment_method, s.payment_provider, s.status,
	0 AS amount, s.money, s.plan_id, s.create_time, s.complete_time, '' AS reference
FROM subscription_orders s`

// financeOrderTimeSQL 订单归属时间：成功订单看完成时间，其余看创建时间
const financeOrderTimeSQL = "CASE WHEN o.status = 'success' AND o.complete_time > 0 THEN o.complete_time ELSE o.create_time END"

// FinanceOrderItem 订单中心一行
type FinanceOrderItem struct {
	Id              string  `json:"id"`
	OrderNo         string  `json:"order_no"`
	UserId          int     `json:"user_id"`
	Username        string  `json:"username"`
	OrderType       string  `json:"order_type"`
	TradeNo         string  `json:"trade_no"`
	PaymentMethod   string  `json:"payment_method"`
	PaymentProvider string  `json:"payment_provider"`
	Status          string  `json:"status"`
	Currency        string  `json:"currency"`
	Amount          float64 `json:"amount"`
	USDAmount       float64 `json:"usd_amount"`
	CreditAmount    int64   `json:"credit_amount"`
	Subject         string  `json:"subject"`
	PlanId          int     `json:"plan_id"`
	CreateTime      int64   `json:"create_time"`
	CompleteTime    int64   `json:"complete_time"`
	Reference       string  `json:"reference"`
}

type financeOrderScan struct {
	OrderType       string
	SourceId        int
	UserId          int
	TradeNo         string
	PaymentMethod   string
	PaymentProvider string
	Status          string
	Amount          int64
	Money           float64
	PlanId          int
	CreateTime      int64
	CompleteTime    int64
	Reference       string
	Username        string
	PlanTitle       string
	PlanCurrency    string
	PlanTotalAmount int64
}

// financeOrdersQuery 订单视图 + 用户名 + 套餐信息（主库）
func financeOrdersQuery() *gorm.DB {
	return DB.Table("(" + financeOrdersUnionSQL + ") AS o").
		Select("o.*, COALESCE(u.username, '') AS username, COALESCE(p.title, '') AS plan_title, COALESCE(p.currency, '') AS plan_currency, COALESCE(p.total_amount, 0) AS plan_total_amount").
		Joins("LEFT JOIN users u ON u.id = o.user_id").
		Joins("LEFT JOIN subscription_plans p ON p.id = o.plan_id")
}

// financeContainsPattern ILIKE 的包含匹配模式，配合 ESCAPE '!' 使用
func financeContainsPattern(keyword string) string {
	keyword = strings.ReplaceAll(keyword, "!", "!!")
	keyword = strings.ReplaceAll(keyword, "%", "!%")
	keyword = strings.ReplaceAll(keyword, "_", "!_")
	return "%" + keyword + "%"
}

// financeOrderItem 币种 / 美元金额 / 权益额度按各支付渠道的写入语义推导（见 model/topup.go 各 Recharge*）：
//   - 易支付：Amount 是美元数、Money 是人民币实付 → CNY，usd = Amount，quota = Amount × QuotaPerUnit
//   - Stripe：Money 是美元 → quota = Money × QuotaPerUnit
//   - Creem / 管理员手动充值（admin）：Amount 即 quota，Money 是美元
//   - Waffo 系：Amount 是美元数，币种取 Waffo 配置
//   - 订阅：币种看套餐，quota = 套餐总额度
func financeOrderItem(scan financeOrderScan) FinanceOrderItem {
	item := FinanceOrderItem{
		Id: fmt.Sprintf("%s:%d", scan.OrderType, scan.SourceId), OrderNo: scan.TradeNo, UserId: scan.UserId, Username: scan.Username,
		OrderType: scan.OrderType, TradeNo: scan.TradeNo, PaymentMethod: scan.PaymentMethod, PaymentProvider: scan.PaymentProvider,
		Status: scan.Status, Currency: financeCurrencyUSD, Amount: scan.Money, PlanId: scan.PlanId, CreateTime: scan.CreateTime, CompleteTime: scan.CompleteTime,
		Reference: scan.Reference,
	}
	quotaPerUnit := common.QuotaPerUnit
	if scan.OrderType == FinanceOrderTypeSubscription {
		item.Subject = scan.PlanTitle
		item.CreditAmount = scan.PlanTotalAmount
		if scan.PlanCurrency != "" {
			item.Currency = strings.ToUpper(scan.PlanCurrency)
		}
		item.USDAmount = scan.Money
		if item.Currency != financeCurrencyUSD && operation_setting.USDExchangeRate > 0 {
			item.USDAmount = scan.Money / operation_setting.USDExchangeRate
		}
		return item
	}
	item.Subject = "余额充值"
	provider := scan.PaymentProvider
	if provider == "" {
		switch scan.PaymentMethod {
		case PaymentMethodStripe, PaymentMethodCreem, PaymentMethodWaffo, PaymentMethodWaffoPancake:
			provider = scan.PaymentMethod
		default:
			provider = PaymentProviderEpay
		}
	}
	switch provider {
	case PaymentProviderStripe:
		item.USDAmount = scan.Money
		item.CreditAmount = int64(scan.Money * quotaPerUnit)
	case PaymentProviderCreem, PaymentProviderAdmin:
		item.USDAmount = scan.Money
		item.CreditAmount = scan.Amount
	case PaymentProviderWaffo, PaymentProviderWaffoPancake:
		if setting.WaffoCurrency != "" {
			item.Currency = strings.ToUpper(setting.WaffoCurrency)
		}
		item.USDAmount = float64(scan.Amount)
		item.CreditAmount = int64(float64(scan.Amount) * quotaPerUnit)
	default:
		item.Currency = financeCurrencyCNY
		item.USDAmount = float64(scan.Amount)
		item.CreditAmount = int64(float64(scan.Amount) * quotaPerUnit)
	}
	return item
}

// FinanceOrderFilter 订单中心筛选
type FinanceOrderFilter struct {
	Range         FinanceRange
	Keyword       string
	Username      string
	OrderType     string
	Status        string
	PaymentMethod string
}

// ListFinanceOrders 订单中心列表（主库）
func ListFinanceOrders(filter FinanceOrderFilter, startIdx int, num int) ([]FinanceOrderItem, int64, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, 0, err
	}
	query := financeOrdersQuery().Where(financeOrderTimeSQL+" >= ? AND "+financeOrderTimeSQL+" < ?", filter.Range.Start, filter.Range.EndExcl)
	if filter.Keyword != "" {
		pattern := financeContainsPattern(filter.Keyword)
		query = query.Where("(o.trade_no ILIKE ? ESCAPE '!' OR o.reference ILIKE ? ESCAPE '!' OR p.title ILIKE ? ESCAPE '!')", pattern, pattern, pattern)
	}
	if filter.Username != "" {
		query = query.Where("u.username ILIKE ? ESCAPE '!'", financeContainsPattern(filter.Username))
	}
	if filter.OrderType != "" {
		query = query.Where("o.order_type = ?", filter.OrderType)
	}
	if filter.Status != "" {
		query = query.Where("o.status = ?", filter.Status)
	}
	if filter.PaymentMethod != "" {
		query = query.Where("(o.payment_method = ? OR o.payment_provider = ?)", filter.PaymentMethod, filter.PaymentMethod)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	scans := make([]financeOrderScan, 0)
	if err := query.Order(financeOrderTimeSQL + " DESC, o.source_id DESC").Limit(num).Offset(startIdx).Scan(&scans).Error; err != nil {
		return nil, 0, err
	}
	items := make([]FinanceOrderItem, 0, len(scans))
	for _, scan := range scans {
		items = append(items, financeOrderItem(scan))
	}
	return items, total, nil
}

// ListFinanceSuccessfulOrders 区间内（按完成时间）的成功订单，经营看板用，不分页
func ListFinanceSuccessfulOrders(r FinanceRange) ([]FinanceOrderItem, error) {
	scans := make([]financeOrderScan, 0)
	err := financeOrdersQuery().
		Where("o.status = ? AND o.complete_time >= ? AND o.complete_time < ?", common.TopUpStatusSuccess, r.Start, r.EndExcl).
		Order("o.complete_time ASC, o.source_id ASC").Scan(&scans).Error
	if err != nil {
		return nil, err
	}
	items := make([]FinanceOrderItem, 0, len(scans))
	for _, scan := range scans {
		items = append(items, financeOrderItem(scan))
	}
	return items, nil
}

// FinanceFirstPaidTimes 每个用户首个成功订单的完成时间（完成时间早于 before）
func FinanceFirstPaidTimes(before int64) (map[int]int64, error) {
	type row struct {
		UserId    int
		FirstPaid int64
	}
	rows := make([]row, 0)
	err := DB.Table("("+financeOrdersUnionSQL+") AS o").
		Select("o.user_id, MIN(o.complete_time) AS first_paid").
		Where("o.status = ? AND o.user_id > 0 AND o.complete_time > 0 AND o.complete_time < ?", common.TopUpStatusSuccess, before).
		Group("o.user_id").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int]int64, len(rows))
	for _, item := range rows {
		result[item.UserId] = item.FirstPaid
	}
	return result, nil
}
