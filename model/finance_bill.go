package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
)

// 企业账单在财务中心的统一视图：已出账（ent_bills）与进行中账期（ent_credit_periods open / closing）映射成同一形状。
// 账单明细按企业主 user_id + 账期区间扫 logs；账期与账单的 period_start / period_end 都是半开区间 [start, end)。

const (
	FinanceBillKindBill   = "bill"
	FinanceBillKindPeriod = "period"
)

// 账单详情逐条明细的数据来源（FinanceBillContext.UsageSource）
const (
	// FinanceUsageSourceLive 实时 logs：进行中账期、未归档账单、账期内 logs 尚未清理
	FinanceUsageSourceLive = "live"
	// FinanceUsageSourceArchive 账期内 logs 已清理且账期包带 JSON 旁路件：明细改读冻结件
	FinanceUsageSourceArchive = "archive"
	// FinanceUsageSourceArchiveUnavailable 账期内 logs 已清理但没有可读的冻结件（未归档或 v1 归档）：明细不完整
	FinanceUsageSourceArchiveUnavailable = "archive_unavailable"
)

// FinanceBillSummary 账单列表 / 详情页头部共用的形状
type FinanceBillSummary struct {
	Kind           string `json:"kind"`
	Id             int64  `json:"id"`
	EnterpriseId   int    `json:"enterprise_id"`
	EnterpriseName string `json:"enterprise_name"`
	UserId         int    `json:"user_id"`
	Username       string `json:"username"`
	BillNo         string `json:"bill_no"`
	BillType       string `json:"bill_type"`
	PeriodNo       int    `json:"period_no"`
	PeriodStart    int64  `json:"period_start"`
	PeriodEnd      int64  `json:"period_end"`
	AmountQuota    int64  `json:"amount_quota"`
	TotalUSD       string `json:"total_usd"`
	PaidUSD        string `json:"paid_usd"`
	Status         string `json:"status"`
	IssuedAt       int64  `json:"issued_at"`
	DueAt          int64  `json:"due_at"`
	LimitQuota     int64  `json:"limit_quota"`
	UsedQuota      int64  `json:"used_quota"`
}

// FinanceBillList bills 接口返回：已出账分页 + 进行中账期（不分页，数量不超过授信企业数）
type FinanceBillList struct {
	Items       []*FinanceBillSummary `json:"items"`
	Total       int64                 `json:"total"`
	OpenPeriods []*FinanceBillSummary `json:"open_periods"`
}

// FinanceBillUser 详情页需要的主账号信息
type FinanceBillUser struct {
	Id          int    `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
}

// FinanceBillContext 账单详情上下文；明细由前端再按 user_id + usage_ts_start / usage_ts_end 调用用量接口
type FinanceBillContext struct {
	Kind         string                  `json:"kind"`
	Summary      *FinanceBillSummary     `json:"summary"`
	Enterprise   *Enterprise             `json:"enterprise"`
	User         *FinanceBillUser        `json:"user"`
	Bill         *EnterpriseBill         `json:"bill"`
	Period       *EnterpriseCreditPeriod `json:"period"`
	UsageTsStart int64                   `json:"usage_ts_start"`
	UsageTsEnd   int64                   `json:"usage_ts_end"`
	// LogsPurged 账期内已有原始日志被归档删除：明细区按实时 logs 计算会不完整，应以账期包冻结件为准
	LogsPurged bool `json:"logs_purged"`
	// UsageSource 逐条明细的数据来源：live | archive | archive_unavailable（见 FinanceUsageSource*）
	UsageSource string `json:"usage_source"`
}

type financeEnterpriseBrief struct {
	Id       int
	UserId   int
	Name     string
	Username string
}

// financeEnterpriseBriefs 企业名与主账号用户名（主库一次查询）
func financeEnterpriseBriefs(enterpriseIds []int) (map[int]financeEnterpriseBrief, error) {
	result := make(map[int]financeEnterpriseBrief, len(enterpriseIds))
	if len(enterpriseIds) == 0 {
		return result, nil
	}
	rows := make([]financeEnterpriseBrief, 0, len(enterpriseIds))
	err := DB.Table("enterprises e").Select("e.id, e.user_id, e.name, COALESCE(u.username, '') AS username").
		Joins("LEFT JOIN users u ON u.id = e.user_id").Where("e.id IN ?", enterpriseIds).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.Id] = row
	}
	return result, nil
}

func financeBillSummaryFromBill(bill *EnterpriseBill, brief financeEnterpriseBrief, period *EnterpriseCreditPeriod) *FinanceBillSummary {
	summary := &FinanceBillSummary{
		Kind: FinanceBillKindBill, Id: bill.Id, EnterpriseId: bill.EnterpriseId, EnterpriseName: brief.Name, UserId: brief.UserId, Username: brief.Username,
		BillNo: bill.BillNo, BillType: bill.BillType, PeriodStart: bill.PeriodStart, PeriodEnd: bill.PeriodEnd, AmountQuota: bill.AmountQuota,
		TotalUSD: bill.TotalUSD.StringFixed(6), PaidUSD: bill.PaidUSD.StringFixed(6), Status: bill.Status, IssuedAt: bill.IssuedAt, DueAt: bill.DueAt,
		UsedQuota: bill.AmountQuota,
	}
	if period != nil {
		summary.PeriodNo = period.PeriodNo
		summary.LimitQuota = period.LimitQuota
	}
	return summary
}

func financeBillSummaryFromPeriod(period *EnterpriseCreditPeriod, brief financeEnterpriseBrief) *FinanceBillSummary {
	return &FinanceBillSummary{
		Kind: FinanceBillKindPeriod, Id: period.Id, EnterpriseId: period.EnterpriseId, EnterpriseName: brief.Name, UserId: brief.UserId, Username: brief.Username,
		BillType: EnterpriseBillTypeCredit, PeriodNo: period.PeriodNo, PeriodStart: period.StartAt, PeriodEnd: period.EndAt,
		AmountQuota: period.UsedQuota, TotalUSD: FinanceQuotaToUSD(period.UsedQuota), PaidUSD: "0.000000", Status: period.Status,
		LimitQuota: period.LimitQuota, UsedQuota: period.UsedQuota,
	}
}

// ListFinanceBills 已出账账单分页；includeOpen 时附带全部进行中 / 待出账账期
func ListFinanceBills(filter EnterpriseBillFilter, includeOpen bool, startIdx int, num int) (*FinanceBillList, error) {
	bills, total, err := ListEnterpriseBills(filter, startIdx, num)
	if err != nil {
		return nil, err
	}
	result := &FinanceBillList{Items: make([]*FinanceBillSummary, 0, len(bills)), Total: total, OpenPeriods: []*FinanceBillSummary{}}
	enterpriseIds := make([]int, 0)
	periodIds := make([]int64, 0)
	for _, bill := range bills {
		enterpriseIds = append(enterpriseIds, bill.EnterpriseId)
		if bill.PeriodId > 0 {
			periodIds = append(periodIds, bill.PeriodId)
		}
	}
	openPeriods := make([]*EnterpriseCreditPeriod, 0)
	if includeOpen {
		query := DB.Where("status IN ?", []string{EnterpriseCreditPeriodOpen, EnterpriseCreditPeriodClosing})
		if filter.EnterpriseId > 0 {
			query = query.Where("enterprise_id = ?", filter.EnterpriseId)
		}
		if err := query.Order("end_at ASC, id ASC").Find(&openPeriods).Error; err != nil {
			return nil, err
		}
		for _, period := range openPeriods {
			enterpriseIds = append(enterpriseIds, period.EnterpriseId)
		}
	}
	briefs, err := financeEnterpriseBriefs(enterpriseIds)
	if err != nil {
		return nil, err
	}
	periods := make(map[int64]*EnterpriseCreditPeriod, len(periodIds))
	if len(periodIds) > 0 {
		rows := make([]*EnterpriseCreditPeriod, 0, len(periodIds))
		if err := DB.Where("id IN ?", periodIds).Find(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			periods[row.Id] = row
		}
	}
	for _, bill := range bills {
		result.Items = append(result.Items, financeBillSummaryFromBill(bill, briefs[bill.EnterpriseId], periods[bill.PeriodId]))
	}
	for _, period := range openPeriods {
		result.OpenPeriods = append(result.OpenPeriods, financeBillSummaryFromPeriod(period, briefs[period.EnterpriseId]))
	}
	return result, nil
}

// GetFinanceBillContext 账单详情上下文。kind=bill 查 ent_bills，kind=period 查 ent_credit_periods（任意状态）。
// 对外的 usage_ts_end 是闭区间：period_end − 1；进行中账期取 min(now, end − 1)
func GetFinanceBillContext(kind string, id int64) (*FinanceBillContext, error) {
	context := &FinanceBillContext{Kind: kind}
	var enterpriseId int
	switch kind {
	case FinanceBillKindBill:
		bill, err := GetEnterpriseBill(id)
		if err != nil {
			return nil, err
		}
		context.Bill = bill
		enterpriseId = bill.EnterpriseId
		if bill.PeriodId > 0 {
			if period, err := GetCreditPeriodById(bill.PeriodId); err == nil {
				context.Period = period
			}
		}
	case FinanceBillKindPeriod:
		period, err := GetCreditPeriodById(id)
		if err != nil {
			return nil, ErrEnterpriseResourceNotFound
		}
		context.Period = period
		enterpriseId = period.EnterpriseId
	default:
		return nil, fmt.Errorf("invalid bill kind %q", kind)
	}
	enterprise, err := GetEnterpriseById(enterpriseId)
	if err != nil {
		return nil, err
	}
	context.Enterprise = enterprise
	var user User
	if err := DB.Unscoped().Select("id, username, display_name, email").Where("id = ?", enterprise.UserId).First(&user).Error; err == nil {
		context.User = &FinanceBillUser{Id: user.Id, Username: user.Username, DisplayName: user.DisplayName, Email: user.Email}
	}
	brief := financeEnterpriseBrief{Id: enterprise.Id, UserId: enterprise.UserId, Name: enterprise.Name}
	if context.User != nil {
		brief.Username = context.User.Username
	}
	if context.Bill != nil {
		context.Summary = financeBillSummaryFromBill(context.Bill, brief, context.Period)
	} else {
		context.Summary = financeBillSummaryFromPeriod(context.Period, brief)
	}
	context.UsageSource = FinanceUsageSourceLive
	if context.Bill != nil {
		if context.LogsPurged, err = BillPeriodLogsPurged(context.Bill); err != nil {
			return nil, err
		}
		if context.LogsPurged {
			context.UsageSource = BillUsageSource(context.Bill)
		}
	}
	context.UsageTsStart = context.Summary.PeriodStart
	context.UsageTsEnd = context.Summary.PeriodEnd - 1
	now := common.GetTimestamp()
	if context.Summary.PeriodEnd <= context.Summary.PeriodStart || (context.Bill == nil && context.UsageTsEnd > now) {
		context.UsageTsEnd = now
	}
	return context, nil
}
