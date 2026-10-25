package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// 经营看板：新增注册 / 新增付费 / 订单收入 / 全体与付费用户净消耗，按上海时区日分桶。
// 付费用户 = 非管理员 且（企业主账号 或 有成功订单）；消耗净额 = 消费 − 退款。

// FinanceDailyStats 每日经营明细一行；Summary 复用同一结构（Date 为空）
type FinanceDailyStats struct {
	Date                 string  `json:"date,omitempty"`
	NewUsers             int64   `json:"new_users"`
	NewPaidUsers         int64   `json:"new_paid_users"`
	PaidOrderCount       int64   `json:"paid_order_count"`
	PaidAmount           float64 `json:"paid_amount"`
	WalletAmount         float64 `json:"wallet_amount"`
	SubscriptionAmount   float64 `json:"subscription_amount"`
	AllUserConsumeQuota  int64   `json:"all_user_consume_quota"`
	PaidUserConsumeQuota int64   `json:"paid_user_consume_quota"`
}

// FinanceOverview overview 接口返回
type FinanceOverview struct {
	StartDate         string               `json:"start_date"`
	EndDate           string               `json:"end_date"`
	DisplayCurrency   string               `json:"display_currency"`
	LogConsumeEnabled bool                 `json:"log_consume_enabled"`
	Summary           FinanceDailyStats    `json:"summary"`
	Daily             []*FinanceDailyStats `json:"daily"`
}

type financeDayCount struct {
	Day   string
	Count int64
}

// financeDisplayCurrency 站点展示币种：TOKENS 展示模式下金额按 USD 汇总
func financeDisplayCurrency() string {
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		return financeCurrencyCNY
	case operation_setting.QuotaDisplayTypeCustom:
		return operation_setting.QuotaDisplayTypeCustom
	default:
		return financeCurrencyUSD
	}
}

// financeDisplayAmount 订单金额折算到展示币种：同币种直接用原金额，否则用美元金额乘站点汇率
func financeDisplayAmount(item FinanceOrderItem, displayCurrency string) float64 {
	if item.Currency == displayCurrency {
		return item.Amount
	}
	return item.USDAmount * operation_setting.GetUsdToCurrencyRate(operation_setting.USDExchangeRate)
}

// financePaidUserIds 付费用户集合：非管理员，且是企业主账号或在 before 之前有成功订单（含软删用户，历史消耗仍归属）
func financePaidUserIds(before int64) ([]int, error) {
	firstPaid, err := FinanceFirstPaidTimes(before)
	if err != nil {
		return nil, err
	}
	orderUserIds := make([]int, 0, len(firstPaid))
	for userId := range firstPaid {
		orderUserIds = append(orderUserIds, userId)
	}
	ids := make([]int, 0)
	query := DB.Unscoped().Model(&User{}).Where("role < ?", common.RoleAdminUser)
	if len(orderUserIds) > 0 {
		query = query.Where("(EXISTS (SELECT 1 FROM enterprises e WHERE e.user_id = users.id) OR users.id IN ?)", orderUserIds)
	} else {
		query = query.Where("EXISTS (SELECT 1 FROM enterprises e WHERE e.user_id = users.id)")
	}
	err = query.Pluck("id", &ids).Error
	return ids, err
}

// financeDailyNetConsume 按天净消耗（消费 − 退款）；userIds 为 nil 表示全体用户。
// 读 tf_log_daily_rollups + 实时补边（见 ReadLogUsageByDay），不再全区间扫 logs
func financeDailyNetConsume(r FinanceRange, userIds []int) (map[string]int64, error) {
	byDay, err := ReadLogUsageByDay(userIds, r)
	if err != nil {
		return nil, err
	}
	result := make(map[string]int64, len(byDay))
	for day, totals := range byDay {
		result[day] = totals.NetQuota
	}
	return result, nil
}

// GetFinanceOverview 经营看板
func GetFinanceOverview(r FinanceRange) (*FinanceOverview, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, err
	}
	days := r.Days()
	daily := make(map[string]*FinanceDailyStats, len(days))
	overview := &FinanceOverview{
		StartDate: days[0], EndDate: days[len(days)-1], DisplayCurrency: financeDisplayCurrency(), LogConsumeEnabled: common.LogConsumeEnabled,
		Daily: make([]*FinanceDailyStats, 0, len(days)),
	}
	for _, day := range days {
		stats := &FinanceDailyStats{Date: day}
		daily[day] = stats
		overview.Daily = append(overview.Daily, stats)
	}

	// 新增注册：users.created_at（老用户为 0，自然落在区间外）；含后来被删除的用户
	registrations := make([]financeDayCount, 0)
	err := DB.Unscoped().Model(&User{}).
		Select("to_char(to_timestamp(created_at) AT TIME ZONE '"+financeTimeZone+"', 'YYYY-MM-DD') AS day, COUNT(*) AS count").
		Where("created_at >= ? AND created_at < ?", r.Start, r.EndExcl).Group("day").Scan(&registrations).Error
	if err != nil {
		return nil, err
	}
	for _, row := range registrations {
		if stats, ok := daily[row.Day]; ok {
			stats.NewUsers = row.Count
		}
	}

	// 新增付费用户：首个成功订单的完成日
	firstPaid, err := FinanceFirstPaidTimes(r.EndExcl)
	if err != nil {
		return nil, err
	}
	for _, paidAt := range firstPaid {
		if paidAt < r.Start {
			continue
		}
		if stats, ok := daily[FinanceDay(paidAt)]; ok {
			stats.NewPaidUsers++
		}
	}

	// 订单收入：按完成日，金额折算到展示币种
	orders, err := ListFinanceSuccessfulOrders(r)
	if err != nil {
		return nil, err
	}
	for _, order := range orders {
		stats, ok := daily[FinanceDay(order.CompleteTime)]
		if !ok {
			continue
		}
		amount := financeDisplayAmount(order, overview.DisplayCurrency)
		stats.PaidOrderCount++
		stats.PaidAmount += amount
		if order.OrderType == FinanceOrderTypeSubscription {
			stats.SubscriptionAmount += amount
		} else {
			stats.WalletAmount += amount
		}
	}

	// 全体 / 付费用户净消耗
	allConsume, err := financeDailyNetConsume(r, nil)
	if err != nil {
		return nil, err
	}
	paidUserIds, err := financePaidUserIds(r.EndExcl)
	if err != nil {
		return nil, err
	}
	paidConsume, err := financeDailyNetConsume(r, paidUserIds)
	if err != nil {
		return nil, err
	}
	for day, stats := range daily {
		stats.AllUserConsumeQuota = allConsume[day]
		stats.PaidUserConsumeQuota = paidConsume[day]
	}

	for _, stats := range overview.Daily {
		overview.Summary.NewUsers += stats.NewUsers
		overview.Summary.NewPaidUsers += stats.NewPaidUsers
		overview.Summary.PaidOrderCount += stats.PaidOrderCount
		overview.Summary.PaidAmount += stats.PaidAmount
		overview.Summary.WalletAmount += stats.WalletAmount
		overview.Summary.SubscriptionAmount += stats.SubscriptionAmount
		overview.Summary.AllUserConsumeQuota += stats.AllUserConsumeQuota
		overview.Summary.PaidUserConsumeQuota += stats.PaidUserConsumeQuota
	}
	return overview, nil
}
