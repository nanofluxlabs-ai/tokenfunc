package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// 账单类型
const (
	EnterpriseBillTypeCredit    = "credit"    // 授信出账，需要收款
	EnterpriseBillTypeStatement = "statement" // 预付月度对账单，仅展示
)

// 账单状态
const (
	EnterpriseBillUnpaid        = "unpaid"
	EnterpriseBillPartiallyPaid = "partially_paid"
	EnterpriseBillPaid          = "paid"
	EnterpriseBillVoid          = "void"
)

const (
	// 账期转 closing 后等待在途请求的最长时间，超过则直接出账（进程崩溃导致在途计数泄漏时的兜底）
	enterpriseBillClosingGraceSeconds = 30 * 60
	// 逾期催款节奏：到期当天及逾期第 1/3/7/14 天各一次
	enterpriseSellerProfileOptionKey = "enterprise.seller_profile"
)

var enterpriseReminderOverdueDays = []int{0, 1, 3, 7, 14}

var (
	ErrEnterpriseBillNotPayable = errors.New("bill is not payable")
	ErrEnterpriseBillOverpaid   = errors.New("payment exceeds the outstanding amount")
	ErrEnterprisePeriodNotReady = errors.New("credit period is not ready for billing")
)

// EnterpriseBill 账单：授信账期出账 / 预付月度对账单。出账时快照买卖双方信息，之后改配置不影响历史账单
type EnterpriseBill struct {
	Id                 int64           `json:"id"`
	BillNo             string          `json:"bill_no" gorm:"type:varchar(32);uniqueIndex"`
	EnterpriseId       int             `json:"enterprise_id" gorm:"not null;index:idx_ent_bill_ent_type,priority:1;uniqueIndex:uk_ent_bill_statement,priority:1,where:bill_type = 'statement'"`
	PeriodId           int64           `json:"period_id" gorm:"not null;default:0"`
	BillType           string          `json:"bill_type" gorm:"type:varchar(16);not null;index:idx_ent_bill_ent_type,priority:2;uniqueIndex:uk_ent_bill_statement,priority:2,where:bill_type = 'statement'"`
	PeriodStart        int64           `json:"period_start" gorm:"not null;uniqueIndex:uk_ent_bill_statement,priority:3,where:bill_type = 'statement'"`
	PeriodEnd          int64           `json:"period_end" gorm:"not null"`
	AmountQuota        int64           `json:"amount_quota" gorm:"not null;default:0"`
	AmountUSD          decimal.Decimal `json:"amount_usd" gorm:"type:numeric(20,6);not null;default:0"`
	AdjustmentUSD      decimal.Decimal `json:"adjustment_usd" gorm:"type:numeric(20,6);not null;default:0"`
	TotalUSD           decimal.Decimal `json:"total_usd" gorm:"type:numeric(20,6);not null;default:0"`
	PaidUSD            decimal.Decimal `json:"paid_usd" gorm:"type:numeric(20,6);not null;default:0"`
	Currency           string          `json:"currency" gorm:"type:varchar(8);not null;default:'USD'"`
	Status             string          `json:"status" gorm:"type:varchar(16);not null;index"`
	IssuedAt           int64           `json:"issued_at" gorm:"not null"`
	DueAt              int64           `json:"due_at" gorm:"not null;default:0;index"`
	PaidAt             int64           `json:"paid_at" gorm:"not null;default:0"`
	ReminderCount      int             `json:"reminder_count" gorm:"not null;default:0"`
	LastRemindedAt     int64           `json:"last_reminded_at" gorm:"not null;default:0"`
	ReconcileDiffQuota int64           `json:"reconcile_diff_quota" gorm:"not null;default:0"`
	UsageSnapshot      JSONValue       `json:"usage_snapshot" gorm:"type:jsonb"`
	SellerSnapshot     JSONValue       `json:"seller_snapshot" gorm:"type:jsonb"`
	BuyerSnapshot      JSONValue       `json:"buyer_snapshot" gorm:"type:jsonb"`
	Remark             string          `json:"remark" gorm:"type:text"`
	// ArchiveInfo / ArchivedAt 账期包归档登记（见 tokenfunc_bill_archive.go）；ArchivedAt 为 0 表示未归档
	ArchiveInfo JSONValue `json:"archive_info" gorm:"type:jsonb"`
	ArchivedAt  int64     `json:"archived_at" gorm:"not null;default:0;index"`
	CreatedAt   int64     `json:"created_at" gorm:"not null"`
	UpdatedAt   int64     `json:"updated_at" gorm:"not null"`
}

func (EnterpriseBill) TableName() string { return "ent_bills" }

// Outstanding 未付金额
func (b *EnterpriseBill) Outstanding() decimal.Decimal {
	return b.TotalUSD.Sub(b.PaidUSD)
}

// IsOverdue 是否逾期未结清
func (b *EnterpriseBill) IsOverdue(now int64) bool {
	return (b.Status == EnterpriseBillUnpaid || b.Status == EnterpriseBillPartiallyPaid) && b.DueAt > 0 && b.DueAt <= now
}

// EnterpriseSellerProfile 我方开票信息（系统配置，出账时快照进账单）
type EnterpriseSellerProfile struct {
	CompanyName     string `json:"company_name"`
	Address         string `json:"address"`
	TaxId           string `json:"tax_id"`
	Email           string `json:"email"`
	Phone           string `json:"phone"`
	BankName        string `json:"bank_name"`
	BankAccountName string `json:"bank_account_name"`
	BankAccountNo   string `json:"bank_account_no"`
	SwiftCode       string `json:"swift_code"`
	PaymentNotes    string `json:"payment_notes"`
	FooterNotes     string `json:"footer_notes"`
	LogoUrl         string `json:"logo_url"`
}

func GetEnterpriseSellerProfile() EnterpriseSellerProfile {
	var profile EnterpriseSellerProfile
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[enterpriseSellerProfileOptionKey]
	common.OptionMapRWMutex.RUnlock()
	if raw != "" {
		if err := common.UnmarshalJsonStr(raw, &profile); err != nil {
			common.SysLog("failed to parse enterprise seller profile: " + err.Error())
		}
	}
	return profile
}

func SaveEnterpriseSellerProfile(profile EnterpriseSellerProfile) error {
	raw, err := common.Marshal(profile)
	if err != nil {
		return err
	}
	return UpdateOption(enterpriseSellerProfileOptionKey, string(raw))
}

// QuotaToUSD quota 转 USD（6 位小数）
func QuotaToUSD(quota int64) decimal.Decimal {
	return decimal.NewFromInt(quota).Div(decimal.NewFromFloat(common.QuotaPerUnit)).Round(6)
}

// enterpriseBillNo 账单号：TF-YYYYMM-<id 六位>
func enterpriseBillNo(issuedAt int64, id int64) string {
	return fmt.Sprintf("TF-%s-%06d", time.Unix(issuedAt, 0).In(enterpriseBillingLocation).Format("200601"), id)
}

// summarizeUsageByPeriod 账期内按模型/团队/成员的汇总，写进账单快照
func summarizeUsageByPeriod(tx *gorm.DB, enterpriseId int, periodId int64) (map[string]any, error) {
	snapshot := map[string]any{}
	sums := enterpriseUsageSums
	groups := []struct {
		key   string
		query *gorm.DB
	}{
		{"by_model", tx.Table("ent_usage_daily u").Select("0 AS key_id, u.model_name AS key_name, " + sums).Group("u.model_name")},
		{"by_team", tx.Table("ent_usage_daily u").Select("u.team_id AS key_id, COALESCE(MAX(tm.name), '') AS key_name, " + sums).
			Joins("LEFT JOIN ent_teams tm ON tm.id = u.team_id").Group("u.team_id")},
		{"by_member", tx.Table("ent_usage_daily u").Select("u.member_id AS key_id, COALESCE(MAX(m.name), '') AS key_name, " + sums).
			Joins("LEFT JOIN ent_members m ON m.id = u.member_id").Group("u.member_id")},
	}
	for _, group := range groups {
		items := make([]*EnterpriseUsageSummaryItem, 0)
		err := group.query.Where("u.enterprise_id = ? AND u.period_id = ?", enterpriseId, periodId).Order("quota DESC").Limit(200).Scan(&items).Error
		if err != nil {
			return nil, err
		}
		snapshot[group.key] = items
	}
	return snapshot, nil
}

// IssueCreditBill 对 closing 状态的账期出账（幂等：已 billed 的账期直接返回其账单）。
// 账单金额以账期计数器为准，明细合计用于对账，差异写入 reconcile_diff_quota。
func IssueCreditBill(periodId int64) (*EnterpriseBill, error) {
	var bill *EnterpriseBill
	err := DB.Transaction(func(tx *gorm.DB) error {
		var period EnterpriseCreditPeriod
		if err := lockForUpdate(tx).First(&period, "id = ?", periodId).Error; err != nil {
			return err
		}
		if period.Status == EnterpriseCreditPeriodBilled {
			if period.BillId == 0 {
				return nil
			}
			bill = &EnterpriseBill{}
			return tx.First(bill, "id = ?", period.BillId).Error
		}
		if period.Status != EnterpriseCreditPeriodClosing {
			return ErrEnterprisePeriodNotReady
		}
		var enterprise Enterprise
		if err := tx.First(&enterprise, "id = ?", period.EnterpriseId).Error; err != nil {
			return err
		}
		now := common.GetTimestamp()
		var detailTotal int64
		if err := tx.Model(&EnterpriseUsageDaily{}).Where("enterprise_id = ? AND period_id = ?", period.EnterpriseId, period.Id).
			Select("COALESCE(SUM(quota), 0)").Scan(&detailTotal).Error; err != nil {
			return err
		}
		if period.UsedQuota <= 0 && detailTotal <= 0 {
			// 本期没有消费：不出账单，账期直接结束
			return tx.Model(&EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{
				"status": EnterpriseCreditPeriodBilled, "billed_at": now, "updated_at": now,
			}).Error
		}
		usage, err := summarizeUsageByPeriod(tx, period.EnterpriseId, period.Id)
		if err != nil {
			return err
		}
		usage["detail_total_quota"] = detailTotal
		usageJSON, _ := common.Marshal(usage)
		sellerJSON, _ := common.Marshal(GetEnterpriseSellerProfile())
		buyerJSON, _ := common.Marshal(map[string]any{
			"enterprise_name": enterprise.Name, "contact_name": enterprise.ContactName, "contact_email": enterprise.ContactEmail,
			"billing_profile": enterprise.BillingProfile,
		})
		amountUSD := QuotaToUSD(period.UsedQuota)
		if amountUSD.IsNegative() {
			amountUSD = decimal.Zero
		}
		terms := enterprise.PaymentTermsDays
		if terms <= 0 {
			terms = EnterpriseDefaultPaymentTermsDays
		}
		bill = &EnterpriseBill{
			EnterpriseId:       period.EnterpriseId,
			PeriodId:           period.Id,
			BillType:           EnterpriseBillTypeCredit,
			PeriodStart:        period.StartAt,
			PeriodEnd:          period.EndAt,
			AmountQuota:        period.UsedQuota,
			AmountUSD:          amountUSD,
			TotalUSD:           amountUSD,
			Currency:           enterprise.Currency,
			Status:             EnterpriseBillUnpaid,
			IssuedAt:           now,
			DueAt:              now + int64(terms)*86400,
			ReconcileDiffQuota: period.UsedQuota - detailTotal,
			UsageSnapshot:      JSONValue(usageJSON),
			SellerSnapshot:     JSONValue(sellerJSON),
			BuyerSnapshot:      JSONValue(buyerJSON),
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		if bill.Currency == "" {
			bill.Currency = EnterpriseDefaultCurrency
		}
		if amountUSD.IsZero() {
			bill.Status = EnterpriseBillPaid
			bill.PaidAt = now
		}
		if err := tx.Create(bill).Error; err != nil {
			return err
		}
		bill.BillNo = enterpriseBillNo(now, bill.Id)
		if err := tx.Model(&EnterpriseBill{}).Where("id = ?", bill.Id).Update("bill_no", bill.BillNo).Error; err != nil {
			return err
		}
		if err := tx.Model(&EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{
			"status": EnterpriseCreditPeriodBilled, "bill_id": bill.Id, "billed_at": now, "updated_at": now,
		}).Error; err != nil {
			return err
		}
		return recordEnterpriseLedger(tx, &EnterpriseLedgerEntry{
			EnterpriseId: period.EnterpriseId,
			Type:         EnterpriseLedgerBillIssued,
			AmountQuota:  period.UsedQuota,
			RefType:      "bill",
			RefId:        bill.Id,
			Reference:    bill.BillNo,
			Remark:       fmt.Sprintf("credit period #%d", period.PeriodNo),
		})
	})
	return bill, err
}

// FindClosingPeriodsReadyToBill closing 期中在途已清零、或超过兜底时限的
func FindClosingPeriodsReadyToBill(now int64) ([]*EnterpriseCreditPeriod, error) {
	periods := make([]*EnterpriseCreditPeriod, 0)
	err := DB.Where("status = ? AND (inflight_count <= 0 OR closed_at + ? <= ?)", EnterpriseCreditPeriodClosing, enterpriseBillClosingGraceSeconds, now).
		Order("id ASC").Limit(200).Find(&periods).Error
	return periods, err
}

// RegisterBillPayment 登记收款（支持部分付款），写 bill_payment 流水
func RegisterBillPayment(billId int64, amountUSD decimal.Decimal, operatorId int, reference string, remark string) (*EnterpriseBill, error) {
	if !amountUSD.IsPositive() {
		return nil, errors.New("payment amount must be positive")
	}
	var bill EnterpriseBill
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&bill, "id = ?", billId).Error; err != nil {
			return err
		}
		if bill.BillType != EnterpriseBillTypeCredit || (bill.Status != EnterpriseBillUnpaid && bill.Status != EnterpriseBillPartiallyPaid) {
			return ErrEnterpriseBillNotPayable
		}
		if amountUSD.GreaterThan(bill.Outstanding()) {
			return ErrEnterpriseBillOverpaid
		}
		now := common.GetTimestamp()
		bill.PaidUSD = bill.PaidUSD.Add(amountUSD)
		bill.Status = EnterpriseBillPartiallyPaid
		updates := map[string]any{"paid_usd": bill.PaidUSD, "status": bill.Status, "updated_at": now}
		if bill.PaidUSD.GreaterThanOrEqual(bill.TotalUSD) {
			bill.Status = EnterpriseBillPaid
			bill.PaidAt = now
			updates["status"] = bill.Status
			updates["paid_at"] = now
		}
		if err := tx.Model(&EnterpriseBill{}).Where("id = ?", bill.Id).Updates(updates).Error; err != nil {
			return err
		}
		amountQuota := amountUSD.Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Round(0).IntPart()
		return recordEnterpriseLedger(tx, &EnterpriseLedgerEntry{
			EnterpriseId: bill.EnterpriseId,
			Type:         EnterpriseLedgerBillPayment,
			AmountQuota:  amountQuota,
			RefType:      "bill",
			RefId:        bill.Id,
			OperatorId:   operatorId,
			Reference:    reference,
			Remark:       remark,
		})
	})
	if err != nil {
		return nil, err
	}
	return &bill, nil
}

// VoidBill 作废未结清的账单（账期保持 billed，不会重新出账）
func VoidBill(billId int64, operatorId int, remark string) error {
	remark = strings.TrimSpace(remark)
	if remark == "" {
		return errors.New("a remark is required to void a bill")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var bill EnterpriseBill
		if err := lockForUpdate(tx).First(&bill, "id = ?", billId).Error; err != nil {
			return err
		}
		if bill.Status == EnterpriseBillPaid || bill.Status == EnterpriseBillVoid {
			return ErrEnterpriseBillNotPayable
		}
		now := common.GetTimestamp()
		if err := tx.Model(&EnterpriseBill{}).Where("id = ?", bill.Id).Updates(map[string]any{
			"status": EnterpriseBillVoid, "remark": remark, "updated_at": now,
		}).Error; err != nil {
			return err
		}
		return recordEnterpriseLedger(tx, &EnterpriseLedgerEntry{
			EnterpriseId: bill.EnterpriseId, Type: EnterpriseLedgerAdjustment, AmountQuota: -bill.AmountQuota,
			RefType: "bill", RefId: bill.Id, OperatorId: operatorId, Reference: bill.BillNo, Remark: "void: " + remark,
		})
	})
}

type EnterpriseBillFilter struct {
	EnterpriseId int
	BillType     string
	Status       string
	OverdueOnly  bool
}

func ListEnterpriseBills(filter EnterpriseBillFilter, startIdx int, num int) ([]*EnterpriseBill, int64, error) {
	query := DB.Model(&EnterpriseBill{})
	if filter.EnterpriseId > 0 {
		query = query.Where("enterprise_id = ?", filter.EnterpriseId)
	}
	if filter.BillType != "" {
		query = query.Where("bill_type = ?", filter.BillType)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.OverdueOnly {
		query = query.Where("status IN ? AND due_at > 0 AND due_at <= ?", []string{EnterpriseBillUnpaid, EnterpriseBillPartiallyPaid}, common.GetTimestamp())
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	bills := make([]*EnterpriseBill, 0)
	err := query.Order("id DESC").Limit(num).Offset(startIdx).Find(&bills).Error
	return bills, total, err
}

func GetEnterpriseBill(id int64) (*EnterpriseBill, error) {
	var bill EnterpriseBill
	err := DB.First(&bill, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &bill, err
}

// FindBillsDueForReminder 需要催款的账单：未结清、已到期，且今天还没提醒过，逾期天数命中催款节奏
func FindBillsDueForReminder(now int64) ([]*EnterpriseBill, error) {
	candidates := make([]*EnterpriseBill, 0)
	err := DB.Where("bill_type = ? AND status IN ? AND due_at > 0 AND due_at <= ?",
		EnterpriseBillTypeCredit, []string{EnterpriseBillUnpaid, EnterpriseBillPartiallyPaid}, now).Find(&candidates).Error
	if err != nil {
		return nil, err
	}
	today := enterpriseUsageDay(now)
	due := make([]*EnterpriseBill, 0)
	for _, bill := range candidates {
		if bill.LastRemindedAt > 0 && enterpriseUsageDay(bill.LastRemindedAt) == today {
			continue
		}
		overdueDays := int((now - bill.DueAt) / 86400)
		for _, day := range enterpriseReminderOverdueDays {
			if overdueDays == day {
				due = append(due, bill)
				break
			}
		}
	}
	return due, nil
}

func MarkBillReminded(billId int64, now int64) error {
	return DB.Model(&EnterpriseBill{}).Where("id = ?", billId).Updates(map[string]any{
		"reminder_count":   gorm.Expr("reminder_count + 1"),
		"last_reminded_at": now,
		"updated_at":       now,
	}).Error
}

// GenerateMonthlyStatements 为预付企业生成上个月的对账单（幂等；期初 = 当前余额 − 本月充值 + 本月消耗 − 本月调整）
func GenerateMonthlyStatements(now int64) (int, error) {
	current := time.Unix(now, 0).In(enterpriseBillingLocation)
	monthStart := time.Date(current.Year(), current.Month(), 1, 0, 0, 0, 0, enterpriseBillingLocation)
	periodStart := monthStart.AddDate(0, -1, 0)
	periodEnd := monthStart
	fromDay, toDay := periodStart.Format("2006-01-02"), periodEnd.AddDate(0, 0, -1).Format("2006-01-02")

	var enterprises []Enterprise
	if err := DB.Where("billing_mode = ?", EnterpriseBillingModePrepaid).Find(&enterprises).Error; err != nil {
		return 0, err
	}
	created := 0
	for _, enterprise := range enterprises {
		var exists int64
		if err := DB.Model(&EnterpriseBill{}).Where("enterprise_id = ? AND bill_type = ? AND period_start = ?", enterprise.Id, EnterpriseBillTypeStatement, periodStart.Unix()).Count(&exists).Error; err != nil {
			return created, err
		}
		if exists > 0 {
			continue
		}
		var consumption int64
		if err := DB.Model(&EnterpriseUsageDaily{}).Where("enterprise_id = ? AND day BETWEEN ? AND ?", enterprise.Id, fromDay, toDay).
			Select("COALESCE(SUM(quota), 0)").Scan(&consumption).Error; err != nil {
			return created, err
		}
		var topups, adjustments int64
		ledgerRange := DB.Model(&EnterpriseLedgerEntry{}).Where("enterprise_id = ? AND created_at >= ? AND created_at < ?", enterprise.Id, periodStart.Unix(), periodEnd.Unix())
		if err := ledgerRange.Where("type = ?", EnterpriseLedgerTopup).Select("COALESCE(SUM(amount_quota), 0)").Scan(&topups).Error; err != nil {
			return created, err
		}
		if err := DB.Model(&EnterpriseLedgerEntry{}).Where("enterprise_id = ? AND created_at >= ? AND created_at < ? AND type = ?", enterprise.Id, periodStart.Unix(), periodEnd.Unix(), EnterpriseLedgerAdjustment).
			Select("COALESCE(SUM(amount_quota), 0)").Scan(&adjustments).Error; err != nil {
			return created, err
		}
		var closing int64
		if err := DB.Model(&User{}).Where("id = ?", enterprise.UserId).Select("quota").Scan(&closing).Error; err != nil {
			return created, err
		}
		opening := closing - topups + consumption - adjustments
		snapshot, _ := common.Marshal(map[string]any{
			"opening_quota": opening, "topup_quota": topups, "consumption_quota": consumption,
			"adjustment_quota": adjustments, "closing_quota": closing,
		})
		buyerJSON, _ := common.Marshal(map[string]any{"enterprise_name": enterprise.Name, "billing_profile": enterprise.BillingProfile})
		sellerJSON, _ := common.Marshal(GetEnterpriseSellerProfile())
		bill := &EnterpriseBill{
			EnterpriseId:   enterprise.Id,
			BillType:       EnterpriseBillTypeStatement,
			PeriodStart:    periodStart.Unix(),
			PeriodEnd:      periodEnd.Unix(),
			AmountQuota:    consumption,
			AmountUSD:      QuotaToUSD(consumption),
			TotalUSD:       QuotaToUSD(consumption),
			Currency:       EnterpriseDefaultCurrency,
			Status:         EnterpriseBillPaid,
			IssuedAt:       now,
			PaidAt:         now,
			UsageSnapshot:  JSONValue(snapshot),
			SellerSnapshot: JSONValue(sellerJSON),
			BuyerSnapshot:  JSONValue(buyerJSON),
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		err := DB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(bill).Error; err != nil {
				return err
			}
			return tx.Model(&EnterpriseBill{}).Where("id = ?", bill.Id).Update("bill_no", "ST-"+enterpriseBillNo(periodStart.Unix(), bill.Id)[3:]).Error
		})
		if err != nil {
			if isUniqueViolation(err) {
				continue
			}
			return created, err
		}
		created++
	}
	return created, nil
}
