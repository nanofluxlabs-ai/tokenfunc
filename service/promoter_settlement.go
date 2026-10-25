package service

import (
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// 推广人结算（TokenFunc 二开）：按「推广人 × 自然月」列出结算状态。
// 月净消耗与推广中心同一口径（promoterScope.read：预聚合 + 实时补边 + usage_since 截断），
// 再把名下授信企业主账号的消耗按所属账期的账单状态拆成「已回款 / 待回款」，供双方理解结算为何延迟。
// 系统不计算分成金额；标记已结算时只记录管理员线下结算的金额（可选）/ 流水号 / 备注与当时的快照。

const promoterSettlementMonthLayout = "2006-01"

var (
	errPromoterMonthInvalid       = "Invalid settlement month"
	errPromoterMonthNotSettleable = "Month is not settleable yet"
	errPromoterMonthSettled       = "This month is already settled"
	errPromoterSettlementMissing  = "No settlement record for this month"
	errPromoterAmountNegative     = "Settlement amount cannot be negative"
	errPromoterReferenceTooLong   = "Reference must be at most 128 characters"
	errPromoterRemarkTooLong      = "Remark is too long"
)

// PromoterSettlementRecord 已落库的结算记录；Reference / SettledBy 只在管理员视图下发
type PromoterSettlementRecord struct {
	Id                int64               `json:"id"`
	AmountUSD         decimal.NullDecimal `json:"amount_usd"`
	Remark            string              `json:"remark"`
	SettledAt         int64               `json:"settled_at"`
	Reference         string              `json:"reference,omitempty"`
	SettledBy         int                 `json:"settled_by,omitempty"`
	SettledByUsername string              `json:"settled_by_username,omitempty"`
}

// PromoterSettlementUser 某月某个绑定用户的消耗；HasCredit 为 false 时两个授信桶无意义
type PromoterSettlementUser struct {
	UserId            int    `json:"user_id"`
	Username          string `json:"username"`
	DisplayName       string `json:"display_name"`
	Deleted           bool   `json:"deleted"`
	IsEnterprise      bool   `json:"is_enterprise"`
	NetQuota          int64  `json:"net_quota"`
	HasCredit         bool   `json:"has_credit"`
	CreditPaidQuota   int64  `json:"credit_paid_quota"`
	CreditUnpaidQuota int64  `json:"credit_unpaid_quota"`
}

// PromoterSettlementMonth 一个自然月：整月口径的净消耗、授信拆分、结算状态与按用户子行
type PromoterSettlementMonth struct {
	Month             string                    `json:"month"`
	Settleable        bool                      `json:"settleable"`
	NetQuota          int64                     `json:"net_quota"`
	CreditPaidQuota   int64                     `json:"credit_paid_quota"`
	CreditUnpaidQuota int64                     `json:"credit_unpaid_quota"`
	CreditVoidQuota   int64                     `json:"credit_void_quota,omitempty"`
	Settled           bool                      `json:"settled"`
	Settlement        *PromoterSettlementRecord `json:"settlement,omitempty"`
	Users             []PromoterSettlementUser  `json:"users"`
}

func promoterMonthOf(ts int64) string {
	return time.Unix(ts, 0).In(model.BillingLocation()).Format(promoterSettlementMonthLayout)
}

func promoterMonthStart(month string) (time.Time, error) {
	start, err := time.ParseInLocation(promoterSettlementMonthLayout, month, model.BillingLocation())
	if err != nil {
		return time.Time{}, common.NewMessage(errPromoterMonthInvalid)
	}
	return start, nil
}

// PromoterSettlementMonthRange 自然月 → [1 日 00:00, 下月 1 日 00:00)
func PromoterSettlementMonthRange(month string) (model.FinanceRange, error) {
	start, err := promoterMonthStart(month)
	if err != nil {
		return model.FinanceRange{}, err
	}
	return model.FinanceRange{Start: start.Unix(), EndExcl: start.AddDate(0, 1, 0).Unix()}, nil
}

// promoterMonthsBetween 两个时间戳所在月之间的全部自然月（含两端），倒序
func promoterMonthsBetween(from int64, to int64) []string {
	loc := model.BillingLocation()
	first := time.Unix(from, 0).In(loc)
	last := time.Unix(to, 0).In(loc)
	cursor := time.Date(first.Year(), first.Month(), 1, 0, 0, 0, 0, loc)
	end := time.Date(last.Year(), last.Month(), 1, 0, 0, 0, 0, loc)
	months := make([]string, 0)
	for !cursor.After(end) {
		months = append(months, cursor.Format(promoterSettlementMonthLayout))
		cursor = cursor.AddDate(0, 1, 0)
	}
	for i, j := 0, len(months)-1; i < j; i, j = i+1, j-1 {
		months[i], months[j] = months[j], months[i]
	}
	return months
}

// PromoterMonthsInRange 区间覆盖的自然月（推广中心「结算」tab 用）
func PromoterMonthsInRange(r model.FinanceRange) []string {
	if r.EndExcl <= r.Start {
		return []string{}
	}
	return promoterMonthsBetween(r.Start, r.EndExcl-1)
}

// PromoterAllMonths 推广人创建月到当前月的全部自然月（管理端结算面板用）
func PromoterAllMonths(createdAt int64, now time.Time) []string {
	if createdAt > now.Unix() {
		createdAt = now.Unix()
	}
	return promoterMonthsBetween(createdAt, now.Unix())
}

// creditPeriodCovering 覆盖某个上海日的账期：先按当天末尾找，找不到再按当天开头（固定天数账期边界可能落在一天中间）
func creditPeriodCovering(periods []*model.EnterpriseCreditPeriod, day string) *model.EnterpriseCreditPeriod {
	dayStart, err := time.ParseInLocation("2006-01-02", day, model.BillingLocation())
	if err != nil {
		return nil
	}
	for _, at := range []int64{dayStart.AddDate(0, 0, 1).Unix() - 1, dayStart.Unix()} {
		for _, period := range periods {
			if period.StartAt <= at && at < period.EndAt {
				return period
			}
		}
	}
	return nil
}

// promoterSettlementCalc 一次读取后的折叠结果
type promoterSettlementCalc struct {
	months map[string]*PromoterSettlementMonth
	users  map[string]map[int]*PromoterSettlementUser
}

// computePromoterSettlementMonths 读取 months 覆盖的整段区间，按月 / 用户折叠净消耗并做授信拆分
func computePromoterSettlementMonths(scope promoterScope, months []string) (promoterSettlementCalc, error) {
	calc := promoterSettlementCalc{months: make(map[string]*PromoterSettlementMonth, len(months)), users: make(map[string]map[int]*PromoterSettlementUser, len(months))}
	if len(months) == 0 {
		return calc, nil
	}
	earliest, latest := months[0], months[0]
	for _, month := range months {
		calc.months[month] = &PromoterSettlementMonth{Month: month, Users: []PromoterSettlementUser{}}
		calc.users[month] = make(map[int]*PromoterSettlementUser)
		earliest, latest = min(earliest, month), max(latest, month)
	}
	first, err := PromoterSettlementMonthRange(earliest)
	if err != nil {
		return calc, err
	}
	last, err := PromoterSettlementMonthRange(latest)
	if err != nil {
		return calc, err
	}
	span := model.FinanceRange{Start: first.Start, EndExcl: last.EndExcl}
	rows, err := scope.read(span)
	if err != nil {
		return calc, err
	}
	enterpriseOf, err := model.ListEnterpriseIdsByUserIds(scope.userIds)
	if err != nil {
		return calc, err
	}
	enterpriseIds := make([]int, 0, len(enterpriseOf))
	for _, id := range enterpriseOf {
		enterpriseIds = append(enterpriseIds, id)
	}
	periods, err := model.ListCreditPeriodsOverlapping(enterpriseIds, span)
	if err != nil {
		return calc, err
	}
	periodsOf := make(map[int][]*model.EnterpriseCreditPeriod)
	billIds := make([]int64, 0)
	for _, period := range periods {
		periodsOf[period.EnterpriseId] = append(periodsOf[period.EnterpriseId], period)
		if period.BillId > 0 {
			billIds = append(billIds, period.BillId)
		}
	}
	billStatus, err := model.GetBillStatusesByIds(billIds)
	if err != nil {
		return calc, err
	}

	for _, row := range rows {
		if len(row.Day) < 7 {
			continue
		}
		month := row.Day[:7]
		item := calc.months[month]
		if item == nil {
			continue
		}
		var net int64
		switch row.LogType {
		case model.LogTypeConsume:
			net = row.Quota
		case model.LogTypeRefund:
			net = -row.Quota
		default:
			continue
		}
		user := calc.users[month][row.UserId]
		if user == nil {
			user = &PromoterSettlementUser{UserId: row.UserId}
			calc.users[month][row.UserId] = user
		}
		item.NetQuota += net
		user.NetQuota += net

		enterpriseId, isEnterprise := enterpriseOf[row.UserId]
		if !isEnterprise {
			continue
		}
		period := creditPeriodCovering(periodsOf[enterpriseId], row.Day)
		if period == nil {
			continue // 该天不在任何授信账期内（预付期 / 开通授信前），不是授信消耗
		}
		user.HasCredit = true
		paid := false
		void := false
		switch {
		case period.Status != model.EnterpriseCreditPeriodBilled:
			// open / closing：尚未出账
		case period.BillId == 0:
			paid = true // 零消费账期直接关闭，兜底
		case billStatus[period.BillId] == model.EnterpriseBillPaid:
			paid = true
		case billStatus[period.BillId] == model.EnterpriseBillVoid:
			void = true // 已核销：企业不会再付，按待回款计并单独报数
		}
		if paid {
			item.CreditPaidQuota += net
			user.CreditPaidQuota += net
			continue
		}
		item.CreditUnpaidQuota += net
		user.CreditUnpaidQuota += net
		if void {
			item.CreditVoidQuota += net
		}
	}
	return calc, nil
}

// ListPromoterSettlementMonths 列出 months 的结算状态；withOperator 为管理员视图，附流水号 / 操作人 / 核销数
func ListPromoterSettlementMonths(promoter *model.Promoter, months []string, now time.Time, withOperator bool) ([]PromoterSettlementMonth, error) {
	scope, err := loadPromoterScope(promoter.UserId)
	if err != nil {
		return nil, err
	}
	calc, err := computePromoterSettlementMonths(scope, months)
	if err != nil {
		return nil, err
	}
	briefs, err := model.GetPromoterUserBriefs(scope.userIds)
	if err != nil {
		return nil, err
	}
	enterpriseOf, err := model.ListEnterpriseIdsByUserIds(scope.userIds)
	if err != nil {
		return nil, err
	}
	settlements, err := model.ListActivePromoterSettlements(promoter.UserId)
	if err != nil {
		return nil, err
	}
	settledBy := make(map[string]*model.PromoterSettlement, len(settlements))
	operatorIds := make([]int, 0, len(settlements))
	for _, settlement := range settlements {
		settledBy[settlement.Month] = settlement
		if withOperator && settlement.SettledBy > 0 {
			operatorIds = append(operatorIds, settlement.SettledBy)
		}
	}
	operators, err := model.GetPromoterUserBriefs(operatorIds)
	if err != nil {
		return nil, err
	}

	currentMonth := promoterMonthOf(now.Unix())
	items := make([]PromoterSettlementMonth, 0, len(months))
	for _, month := range months {
		item := calc.months[month]
		if item == nil {
			continue
		}
		item.Settleable = month < currentMonth
		if !withOperator {
			item.CreditVoidQuota = 0
		}
		users := make([]PromoterSettlementUser, 0, len(calc.users[month]))
		for _, user := range calc.users[month] {
			if brief := briefs[user.UserId]; brief != nil {
				user.Username, user.DisplayName, user.Deleted = brief.Username, brief.DisplayName, brief.Deleted
			}
			_, user.IsEnterprise = enterpriseOf[user.UserId]
			users = append(users, *user)
		}
		sort.Slice(users, func(i, j int) bool {
			if users[i].NetQuota != users[j].NetQuota {
				return users[i].NetQuota > users[j].NetQuota
			}
			return users[i].UserId < users[j].UserId
		})
		item.Users = users
		if settlement := settledBy[month]; settlement != nil {
			item.Settled = true
			item.Settlement = promoterSettlementRecord(settlement, withOperator, operators)
		}
		items = append(items, *item)
	}
	return items, nil
}

func promoterSettlementRecord(settlement *model.PromoterSettlement, withOperator bool, operators map[int]*model.PromoterUserBrief) *PromoterSettlementRecord {
	record := &PromoterSettlementRecord{Id: settlement.Id, AmountUSD: settlement.AmountUSD, Remark: settlement.Remark, SettledAt: settlement.SettledAt}
	if withOperator {
		record.Reference, record.SettledBy = settlement.Reference, settlement.SettledBy
		if brief := operators[settlement.SettledBy]; brief != nil {
			record.SettledByUsername = brief.Username
		}
	}
	return record
}

// MarkPromoterSettled 标记某月已结算：只允许已结束的自然月，一月一条活跃记录；写入标记时的净消耗 / 待回款 / 分成比例快照
func MarkPromoterSettled(operatorId int, promoter *model.Promoter, month string, amountUSD decimal.NullDecimal, reference string, remark string, now time.Time) (*model.PromoterSettlement, error) {
	if _, err := promoterMonthStart(month); err != nil {
		return nil, err
	}
	if month >= promoterMonthOf(now.Unix()) {
		return nil, common.NewMessage(errPromoterMonthNotSettleable)
	}
	if amountUSD.Valid && amountUSD.Decimal.IsNegative() {
		return nil, common.NewMessage(errPromoterAmountNegative)
	}
	reference, remark = strings.TrimSpace(reference), strings.TrimSpace(remark)
	if len(reference) > 128 {
		return nil, common.NewMessage(errPromoterReferenceTooLong)
	}
	if len(remark) > 255 {
		return nil, common.NewMessage(errPromoterRemarkTooLong)
	}
	if _, err := model.GetActivePromoterSettlement(promoter.UserId, month); err == nil {
		return nil, common.NewMessage(errPromoterMonthSettled)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	scope, err := loadPromoterScope(promoter.UserId)
	if err != nil {
		return nil, err
	}
	calc, err := computePromoterSettlementMonths(scope, []string{month})
	if err != nil {
		return nil, err
	}
	snapshot := calc.months[month]
	ts := now.Unix()
	settlement := &model.PromoterSettlement{
		PromoterUserId: promoter.UserId, Month: month,
		NetQuotaSnapshot: snapshot.NetQuota, CreditUnpaidSnapshot: snapshot.CreditUnpaidQuota, ShareRateSnapshot: promoter.ShareRate,
		AmountUSD: amountUSD, Reference: reference, Remark: remark,
		SettledAt: ts, SettledBy: operatorId, CreatedAt: ts, UpdatedAt: ts,
	}
	if err := model.CreatePromoterSettlement(settlement); err != nil {
		// 并发下撞部分唯一索引：再查一次给出稳定的业务错误
		if _, again := model.GetActivePromoterSettlement(promoter.UserId, month); again == nil {
			return nil, common.NewMessage(errPromoterMonthSettled)
		}
		return nil, err
	}
	return settlement, nil
}

// RevertPromoterSettlement 撤销某月结算，该月回到待结算
func RevertPromoterSettlement(operatorId int, promoter *model.Promoter, month string, now time.Time) error {
	if _, err := promoterMonthStart(month); err != nil {
		return err
	}
	err := model.RevertPromoterSettlement(promoter.UserId, month, operatorId, now.Unix())
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return common.NewMessage(errPromoterSettlementMissing)
	}
	return err
}
