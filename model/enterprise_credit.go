package model

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 授信账期状态
const (
	EnterpriseCreditPeriodOpen    = "open"    // 当前期，接受预扣
	EnterpriseCreditPeriodClosing = "closing" // 已到期，等待在途请求结算
	EnterpriseCreditPeriodBilled  = "billed"  // 已出账，后到的结算差额记入当前期
)

// 资金流水类型
const (
	EnterpriseLedgerTopup                 = "topup"                   // 预付：管理员登记线下充值
	EnterpriseLedgerBillIssued            = "bill_issued"             // 授信出账
	EnterpriseLedgerBillPayment           = "bill_payment"            // 账单收款登记
	EnterpriseLedgerAdjustment            = "adjustment"              // 人工调整
	EnterpriseLedgerCreditLimitChange     = "credit_limit_change"     // 授信额度/模式变更（金额为 0）
	EnterpriseLedgerCrossPeriodAdjustment = "cross_period_adjustment" // 出账后才到达的结算差额
)

// 账期计算使用的时区（自然月按此时区的 1 日 00:00 切分）
var enterpriseBillingLocation = func() *time.Location {
	if location, err := time.LoadLocation("Asia/Shanghai"); err == nil {
		return location
	}
	return time.FixedZone("CST", 8*3600)
}()

var (
	ErrEnterpriseNotCredit          = errors.New("enterprise is not in credit billing mode")
	ErrEnterpriseNotPrepaid         = errors.New("enterprise is not in prepaid billing mode")
	ErrEnterpriseCreditConfig       = errors.New("invalid credit configuration")
	ErrEnterpriseCreditNoOpenPeriod = errors.New("enterprise has no open credit period")
	// ErrEnterpriseCreditAwaitingPayment 额度信用（auto_reset=false）上一期已用满出账，等待收款或管理员手动开期
	ErrEnterpriseCreditAwaitingPayment = errors.New("enterprise credit period is exhausted and awaiting bill payment")
	// ErrEnterpriseCreditPeriodAlreadyOpen 手动开期时已有 open 期
	ErrEnterpriseCreditPeriodAlreadyOpen = errors.New("enterprise already has an open credit period")
)

// EnterpriseCreditPeriod 授信账期：预扣时确定归属，结算/退款都记回同一期
type EnterpriseCreditPeriod struct {
	Id            int64  `json:"id"`
	EnterpriseId  int    `json:"enterprise_id" gorm:"not null;uniqueIndex:uk_ent_period_no,priority:1;uniqueIndex:uk_ent_period_open,priority:1,where:status = 'open'"`
	PeriodNo      int    `json:"period_no" gorm:"not null;uniqueIndex:uk_ent_period_no,priority:2"`
	StartAt       int64  `json:"start_at" gorm:"not null"`
	EndAt         int64  `json:"end_at" gorm:"not null;index"`
	LimitQuota    int64  `json:"limit_quota" gorm:"not null;default:0"`
	UsedQuota     int64  `json:"used_quota" gorm:"not null;default:0"`
	InflightCount int    `json:"inflight_count" gorm:"not null;default:0"`
	Status        string `json:"status" gorm:"type:varchar(16);not null;index"`
	BillId        int64  `json:"bill_id" gorm:"not null;default:0"`
	ClosedAt      int64  `json:"closed_at" gorm:"not null;default:0"`
	BilledAt      int64  `json:"billed_at" gorm:"not null;default:0"`
	CreatedAt     int64  `json:"created_at" gorm:"not null"`
	UpdatedAt     int64  `json:"updated_at" gorm:"not null"`
}

func (EnterpriseCreditPeriod) TableName() string { return "ent_credit_periods" }

// EnterpriseLedgerEntry 资金流水，财务对账的唯一事实来源
type EnterpriseLedgerEntry struct {
	Id                int64     `json:"id"`
	EnterpriseId      int       `json:"enterprise_id" gorm:"not null;index:idx_ent_ledger_ent_time,priority:1"`
	Type              string    `json:"type" gorm:"type:varchar(32);not null;index"`
	AmountQuota       int64     `json:"amount_quota" gorm:"not null;default:0"`
	BalanceAfterQuota int64     `json:"balance_after_quota" gorm:"not null;default:0"`
	RefType           string    `json:"ref_type" gorm:"type:varchar(32);not null;default:''"`
	RefId             int64     `json:"ref_id" gorm:"not null;default:0"`
	OperatorId        int       `json:"operator_id" gorm:"not null;default:0"`
	Reference         string    `json:"reference" gorm:"type:varchar(128);not null;default:''"`
	Remark            string    `json:"remark" gorm:"type:text"`
	Detail            JSONValue `json:"detail" gorm:"type:jsonb"`
	CreatedAt         int64     `json:"created_at" gorm:"not null;index:idx_ent_ledger_ent_time,priority:2"`
}

func (EnterpriseLedgerEntry) TableName() string { return "ent_ledger" }

// EnterpriseCreditConfig 管理员配置授信的入参
type EnterpriseCreditConfig struct {
	CycleType  string
	CycleDays  int
	LimitQuota int64
	// AlertPercent 预警阈值百分比（0..99，0 关闭预警）
	AlertPercent int
	// AutoReset 仅 quota_based 有效：用满后立即开下一期
	AutoReset bool
}

// EnterpriseDefaultCreditAlertPercent 新开通授信时的默认预警阈值
const EnterpriseDefaultCreditAlertPercent = 80

func (c EnterpriseCreditConfig) validate() error {
	if c.AlertPercent < 0 || c.AlertPercent > 99 {
		return fmt.Errorf("%w: alert percent must be between 0 and 99", ErrEnterpriseCreditConfig)
	}
	switch c.CycleType {
	case EnterpriseCreditCycleNaturalMonth:
	case EnterpriseCreditCycleFixedDays:
		if c.CycleDays < 1 || c.CycleDays > 366 {
			return fmt.Errorf("%w: cycle days must be between 1 and 366", ErrEnterpriseCreditConfig)
		}
	case EnterpriseCreditCycleQuotaBased:
		// 额度为 0 时首次预扣就会"用满"，翻转后新期仍为 0，陷入死循环；额度信用必须有正额度
		if c.LimitQuota <= 0 {
			return fmt.Errorf("%w: quota based credit requires a positive limit", ErrEnterpriseCreditConfig)
		}
	default:
		return fmt.Errorf("%w: unknown cycle type %q", ErrEnterpriseCreditConfig, c.CycleType)
	}
	if c.LimitQuota < 0 || c.LimitQuota > common.MaxWalletQuota {
		return fmt.Errorf("%w: credit limit out of range", ErrEnterpriseCreditConfig)
	}
	return nil
}

// creditPeriodBounds 计算包含 now 的账期区间 [start, end)；额度信用没有截止，返回 [now, 0)
func creditPeriodBounds(cycleType string, cycleDays int, anchorAt int64, now int64) (int64, int64) {
	if cycleType == EnterpriseCreditCycleQuotaBased {
		return now, 0
	}
	if cycleType == EnterpriseCreditCycleFixedDays && cycleDays > 0 {
		length := int64(cycleDays) * 86400
		if anchorAt <= 0 || anchorAt > now {
			anchorAt = now
		}
		elapsed := (now - anchorAt) / length
		start := anchorAt + elapsed*length
		return start, start + length
	}
	current := time.Unix(now, 0).In(enterpriseBillingLocation)
	start := time.Date(current.Year(), current.Month(), 1, 0, 0, 0, 0, enterpriseBillingLocation)
	return start.Unix(), start.AddDate(0, 1, 0).Unix()
}

func lockEnterprise(tx *gorm.DB, enterpriseId int) (*Enterprise, error) {
	var enterprise Enterprise
	err := lockForUpdate(tx).First(&enterprise, "id = ?", enterpriseId).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &enterprise, err
}

func recordEnterpriseLedger(tx *gorm.DB, entry *EnterpriseLedgerEntry) error {
	entry.Id = 0
	entry.CreatedAt = common.GetTimestamp()
	return tx.Create(entry).Error
}

// ensureOpenCreditPeriodTx 保证授信企业有且仅有一个 open 期：到期的 open 期转为 closing 并开下一期；没有则开第一期。
// 额度信用（end_at=0）的 open 期永不到期，用满翻转由 RolloverExhaustedCreditPeriod 负责；
// auto_reset=false 且上一期已用满出账时没有 open 期是正常状态，返回 ErrEnterpriseCreditAwaitingPayment 而不开新期。
// 调用方必须已对企业行加锁。
func ensureOpenCreditPeriodTx(tx *gorm.DB, enterprise *Enterprise, now int64) (*EnterpriseCreditPeriod, error) {
	if enterprise.BillingMode != EnterpriseBillingModeCredit {
		return nil, ErrEnterpriseNotCredit
	}
	var open EnterpriseCreditPeriod
	err := tx.Where("enterprise_id = ? AND status = ?", enterprise.Id, EnterpriseCreditPeriodOpen).First(&open).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	periodNo := 1
	startAt, endAt := creditPeriodBounds(enterprise.CreditCycleType, enterprise.CreditCycleDays, enterprise.CreditAnchorAt, now)
	if err == nil {
		if open.EndAt == 0 || now < open.EndAt {
			return &open, nil
		}
		// 到期：转 closing，等在途请求结算完由出账任务处理
		if err := tx.Model(&EnterpriseCreditPeriod{}).Where("id = ?", open.Id).Updates(map[string]any{
			"status":     EnterpriseCreditPeriodClosing,
			"closed_at":  now,
			"updated_at": now,
		}).Error; err != nil {
			return nil, err
		}
		periodNo = open.PeriodNo + 1
		// 相邻周期保持连续：新期从上期结束时刻开始（除非系统停摆太久已跨过多个周期）；额度信用新期从现在开始
		if endAt > 0 && startAt <= open.EndAt {
			startAt = open.EndAt
		}
	} else {
		var maxNo int
		if err := tx.Model(&EnterpriseCreditPeriod{}).Where("enterprise_id = ?", enterprise.Id).Select("COALESCE(MAX(period_no), 0)").Scan(&maxNo).Error; err != nil {
			return nil, err
		}
		if maxNo > 0 && enterprise.CreditCycleType == EnterpriseCreditCycleQuotaBased && !enterprise.CreditAutoReset {
			return nil, ErrEnterpriseCreditAwaitingPayment
		}
		periodNo = maxNo + 1
		// 首期从开通时刻开始，不足一个周期
		startAt = now
	}
	period := &EnterpriseCreditPeriod{
		EnterpriseId: enterprise.Id,
		PeriodNo:     periodNo,
		StartAt:      startAt,
		EndAt:        endAt,
		LimitQuota:   enterprise.CreditLimitQuota,
		Status:       EnterpriseCreditPeriodOpen,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := tx.Create(period).Error; err != nil {
		return nil, err
	}
	return period, nil
}

// EnsureOpenCreditPeriod 返回企业当前的 open 账期，必要时滚动/创建
func EnsureOpenCreditPeriod(enterpriseId int) (*EnterpriseCreditPeriod, error) {
	var period *EnterpriseCreditPeriod
	err := DB.Transaction(func(tx *gorm.DB) error {
		enterprise, err := lockEnterprise(tx, enterpriseId)
		if err != nil {
			return err
		}
		period, err = ensureOpenCreditPeriodTx(tx, enterprise, common.GetTimestamp())
		return err
	})
	if err == nil {
		InvalidateEnterpriseBillingInfoByEnterprise(enterpriseId)
	}
	return period, err
}

func GetOpenCreditPeriod(enterpriseId int) (*EnterpriseCreditPeriod, error) {
	var period EnterpriseCreditPeriod
	err := DB.Where("enterprise_id = ? AND status = ?", enterpriseId, EnterpriseCreditPeriodOpen).First(&period).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseCreditNoOpenPeriod
	}
	return &period, err
}

// openNextCreditPeriodTx 在没有 open 期时开下一期（期号 = 已有最大期号 + 1，从 now 开始），并写 credit_limit_change 流水记录开期原因。
// 调用方必须已对企业行加锁；已有 open 期返回 ErrEnterpriseCreditPeriodAlreadyOpen。
func openNextCreditPeriodTx(tx *gorm.DB, enterprise *Enterprise, now int64, operatorId int, reason string) (*EnterpriseCreditPeriod, error) {
	if enterprise.BillingMode != EnterpriseBillingModeCredit {
		return nil, ErrEnterpriseNotCredit
	}
	var openCount int64
	if err := tx.Model(&EnterpriseCreditPeriod{}).Where("enterprise_id = ? AND status = ?", enterprise.Id, EnterpriseCreditPeriodOpen).Count(&openCount).Error; err != nil {
		return nil, err
	}
	if openCount > 0 {
		return nil, ErrEnterpriseCreditPeriodAlreadyOpen
	}
	var maxNo int
	if err := tx.Model(&EnterpriseCreditPeriod{}).Where("enterprise_id = ?", enterprise.Id).Select("COALESCE(MAX(period_no), 0)").Scan(&maxNo).Error; err != nil {
		return nil, err
	}
	_, endAt := creditPeriodBounds(enterprise.CreditCycleType, enterprise.CreditCycleDays, enterprise.CreditAnchorAt, now)
	period := &EnterpriseCreditPeriod{
		EnterpriseId: enterprise.Id,
		PeriodNo:     maxNo + 1,
		StartAt:      now,
		EndAt:        endAt,
		LimitQuota:   enterprise.CreditLimitQuota,
		Status:       EnterpriseCreditPeriodOpen,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := tx.Create(period).Error; err != nil {
		return nil, err
	}
	detail, _ := common.Marshal(map[string]any{"reason": reason, "period_no": period.PeriodNo, "limit_quota": period.LimitQuota})
	return period, recordEnterpriseLedger(tx, &EnterpriseLedgerEntry{
		EnterpriseId: enterprise.Id,
		Type:         EnterpriseLedgerCreditLimitChange,
		RefType:      "credit_period",
		RefId:        period.Id,
		OperatorId:   operatorId,
		Remark:       "opened credit period #" + fmt.Sprint(period.PeriodNo) + " (" + reason + ")",
		Detail:       JSONValue(detail),
	})
}

// OpenNextCreditPeriod 管理员手动开期：额度信用 auto_reset=false 用满出账后，不等收款提前放行（或账单作废后恢复服务）
func OpenNextCreditPeriod(enterpriseId int, operatorId int, reason string) (*EnterpriseCreditPeriod, error) {
	var period *EnterpriseCreditPeriod
	err := DB.Transaction(func(tx *gorm.DB) error {
		enterprise, err := lockEnterprise(tx, enterpriseId)
		if err != nil {
			return err
		}
		period, err = openNextCreditPeriodTx(tx, enterprise, common.GetTimestamp(), operatorId, reason)
		return err
	})
	if err == nil {
		InvalidateEnterpriseBillingInfoByEnterprise(enterpriseId)
	}
	return period, err
}

// RolloverExhaustedCreditPeriod 额度信用用满翻转：periodId 为预扣被拒的 open 期。
// 返回 rolled=true 表示该期已不再 open（本次或其他副本已关闭），next 为翻转后的 open 期（auto_reset=false 时为 nil，进入待收款）；
// rolled=false 表示没有翻转（非额度信用、该期零消费即单笔请求超过整期额度），调用方按额度不足处理。
// 翻转在企业行锁内完成：open → closing（closed_at=now，交给出账任务），auto_reset 时同事务开 period_no+1 的新期（end_at=0）。
func RolloverExhaustedCreditPeriod(enterpriseId int, periodId int64) (next *EnterpriseCreditPeriod, rolled bool, err error) {
	err = DB.Transaction(func(tx *gorm.DB) error {
		enterprise, err := lockEnterprise(tx, enterpriseId)
		if err != nil {
			return err
		}
		var period EnterpriseCreditPeriod
		if err := lockForUpdate(tx).First(&period, "id = ? AND enterprise_id = ?", periodId, enterpriseId).Error; err != nil {
			return err
		}
		if period.Status != EnterpriseCreditPeriodOpen {
			// 别的请求 / 副本已经翻过：直接用当前 open 期（可能没有）
			rolled = true
			var open EnterpriseCreditPeriod
			err := tx.Where("enterprise_id = ? AND status = ?", enterpriseId, EnterpriseCreditPeriodOpen).First(&open).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			next = &open
			return err
		}
		if enterprise.BillingMode != EnterpriseBillingModeCredit || enterprise.CreditCycleType != EnterpriseCreditCycleQuotaBased || period.UsedQuota <= 0 {
			return nil
		}
		now := common.GetTimestamp()
		if err := tx.Model(&EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{
			"status": EnterpriseCreditPeriodClosing, "closed_at": now, "updated_at": now,
		}).Error; err != nil {
			return err
		}
		rolled = true
		if !enterprise.CreditAutoReset {
			return nil
		}
		next = &EnterpriseCreditPeriod{
			EnterpriseId: enterpriseId,
			PeriodNo:     period.PeriodNo + 1,
			StartAt:      now,
			EndAt:        0,
			LimitQuota:   enterprise.CreditLimitQuota,
			Status:       EnterpriseCreditPeriodOpen,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		return tx.Create(next).Error
	})
	if err != nil {
		return nil, false, err
	}
	if rolled {
		InvalidateEnterpriseBillingInfoByEnterprise(enterpriseId)
	}
	return next, rolled, nil
}

// EnterpriseCreditSnapshot 授信企业的只读额度快照：企业资料 + 当前 open 账期（账期滚动空窗时 Period 为 nil）
type EnterpriseCreditSnapshot struct {
	Enterprise *Enterprise
	Period     *EnterpriseCreditPeriod
}

// GetEnterpriseCreditSnapshot 按主账号 user_id 读取授信额度快照，供 API key 查询接口使用。
// 非企业用户返回 nil, nil；预付企业返回 ErrEnterpriseNotCredit。
// 这里只读不滚期：查询接口不能像 EnsureOpenCreditPeriod 那样加锁写表，账期空窗由调用方按业务处理。
func GetEnterpriseCreditSnapshot(userId int) (*EnterpriseCreditSnapshot, error) {
	info, err := GetEnterpriseBillingInfo(userId)
	if err != nil || info == nil {
		return nil, err
	}
	if info.BillingMode != EnterpriseBillingModeCredit {
		return nil, ErrEnterpriseNotCredit
	}
	enterprise, err := GetEnterpriseById(info.EnterpriseId)
	if err != nil {
		return nil, err
	}
	period, err := GetOpenCreditPeriod(enterprise.Id)
	if errors.Is(err, ErrEnterpriseCreditNoOpenPeriod) {
		return &EnterpriseCreditSnapshot{Enterprise: enterprise}, nil
	}
	if err != nil {
		return nil, err
	}
	return &EnterpriseCreditSnapshot{Enterprise: enterprise, Period: period}, nil
}

func GetCreditPeriodById(id int64) (*EnterpriseCreditPeriod, error) {
	var period EnterpriseCreditPeriod
	err := DB.First(&period, "id = ?", id).Error
	return &period, err
}

// CreditUsageState 一次用量更新后的账期计数，由 UPDATE ... RETURNING 回填；预警判断只用它，不再回查
type CreditUsageState struct {
	PeriodId   int64
	UsedQuota  int64
	LimitQuota int64
}

// AddCreditUsageReturning 原子更新账期用量并返回更新后的 used/limit（PG RETURNING，同一条 UPDATE）。
// enforceLimit=true 时只在 open 期且不超额度时生效（预扣）；否则在 open/closing 期上无条件累加（结算差额、退款）。
// 未命中时 ok=false 且 state 为零值。
func AddCreditUsageReturning(periodId int64, delta int64, inflightDelta int, enforceLimit bool) (bool, CreditUsageState, error) {
	var period EnterpriseCreditPeriod
	query := DB.Model(&period).
		Clauses(clause.Returning{Columns: []clause.Column{{Name: "id"}, {Name: "used_quota"}, {Name: "limit_quota"}}}).
		Where("id = ?", periodId)
	if enforceLimit {
		query = query.Where("status = ? AND used_quota + ? <= limit_quota", EnterpriseCreditPeriodOpen, delta)
	} else {
		query = query.Where("status IN ?", []string{EnterpriseCreditPeriodOpen, EnterpriseCreditPeriodClosing})
	}
	result := query.Updates(map[string]any{
		"used_quota":     gorm.Expr("used_quota + ?", delta),
		"inflight_count": gorm.Expr("GREATEST(inflight_count + ?, 0)", inflightDelta),
		"updated_at":     common.GetTimestamp(),
	})
	if result.Error != nil {
		return false, CreditUsageState{}, result.Error
	}
	if result.RowsAffected != 1 {
		return false, CreditUsageState{}, nil
	}
	return true, CreditUsageState{PeriodId: period.Id, UsedQuota: period.UsedQuota, LimitQuota: period.LimitQuota}, nil
}

// AddCreditUsage 同 AddCreditUsageReturning，只关心是否命中
func AddCreditUsage(periodId int64, delta int64, inflightDelta int, enforceLimit bool) (bool, error) {
	ok, _, err := AddCreditUsageReturning(periodId, delta, inflightDelta, enforceLimit)
	return ok, err
}

// ApplyCreditSettlement 把结算差额记回预扣时的账期；该期已出账时记入当前 open 期并写跨期调整流水。
// 返回实际记账的账期计数（没有任何账期被更新时 PeriodId 为 0）。
func ApplyCreditSettlement(enterpriseId int, periodId int64, delta int64, inflightDelta int) (CreditUsageState, error) {
	applied, state, err := AddCreditUsageReturning(periodId, delta, inflightDelta, false)
	if err != nil || applied {
		return state, err
	}
	if delta == 0 {
		return CreditUsageState{}, nil
	}
	open, err := EnsureOpenCreditPeriod(enterpriseId)
	if errors.Is(err, ErrEnterpriseCreditAwaitingPayment) {
		// 额度信用待收款期间没有 open 期：差额只留流水、不动任何计数器，由人工调账兜底
		return CreditUsageState{}, recordEnterpriseLedger(DB, &EnterpriseLedgerEntry{
			EnterpriseId: enterpriseId,
			Type:         EnterpriseLedgerCrossPeriodAdjustment,
			AmountQuota:  delta,
			RefType:      "credit_period",
			RefId:        periodId,
			Remark:       fmt.Sprintf("settlement of period %d arrived after billing; no open period (awaiting payment)", periodId),
		})
	}
	if err != nil {
		return CreditUsageState{}, fmt.Errorf("period %d is billed and no open period to carry delta %d: %w", periodId, delta, err)
	}
	_, state, err = AddCreditUsageReturning(open.Id, delta, 0, false)
	if err != nil {
		return CreditUsageState{}, err
	}
	return state, recordEnterpriseLedger(DB, &EnterpriseLedgerEntry{
		EnterpriseId: enterpriseId,
		Type:         EnterpriseLedgerCrossPeriodAdjustment,
		AmountQuota:  delta,
		RefType:      "credit_period",
		RefId:        open.Id,
		Remark:       fmt.Sprintf("settlement of period %d arrived after billing", periodId),
	})
}

// ConfigureEnterpriseCredit 开通或修改授信：额度变更立即作用于当前 open 期；周期类型/天数变更从下一期生效
func ConfigureEnterpriseCredit(enterpriseId int, config EnterpriseCreditConfig, operatorId int) error {
	if err := config.validate(); err != nil {
		return err
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		enterprise, err := lockEnterprise(tx, enterpriseId)
		if err != nil {
			return err
		}
		now := common.GetTimestamp()
		previous := map[string]any{
			"billing_mode": enterprise.BillingMode, "cycle_type": enterprise.CreditCycleType,
			"cycle_days": enterprise.CreditCycleDays, "limit_quota": enterprise.CreditLimitQuota,
			"alert_percent": enterprise.CreditAlertPercent, "auto_reset": enterprise.CreditAutoReset,
		}
		updates := map[string]any{
			"billing_mode":         EnterpriseBillingModeCredit,
			"credit_cycle_type":    config.CycleType,
			"credit_cycle_days":    config.CycleDays,
			"credit_limit_quota":   config.LimitQuota,
			"credit_alert_percent": config.AlertPercent,
			"credit_auto_reset":    config.AutoReset,
			"updated_at":           now,
		}
		freshEnable := enterprise.BillingMode != EnterpriseBillingModeCredit
		if enterprise.CreditAnchorAt == 0 || freshEnable {
			updates["credit_anchor_at"] = now
			enterprise.CreditAnchorAt = now
		}
		if err := tx.Model(&Enterprise{}).Where("id = ?", enterpriseId).Updates(updates).Error; err != nil {
			return err
		}
		enterprise.BillingMode = EnterpriseBillingModeCredit
		enterprise.CreditCycleType = config.CycleType
		enterprise.CreditCycleDays = config.CycleDays
		enterprise.CreditLimitQuota = config.LimitQuota
		enterprise.CreditAutoReset = config.AutoReset
		period, err := ensureOpenCreditPeriodTx(tx, enterprise, now)
		if errors.Is(err, ErrEnterpriseCreditAwaitingPayment) {
			// 额度信用待收款：改配置不替企业放行（手动开期 / 收款才开新期）；从预付刚切回授信则直接开第一期
			period, err = nil, nil
			if freshEnable {
				period, err = openNextCreditPeriodTx(tx, enterprise, now, operatorId, "credit_enabled")
			}
		}
		if err != nil {
			return err
		}
		var periodId int64
		if period != nil {
			periodId = period.Id
			if period.LimitQuota != config.LimitQuota {
				if err := tx.Model(&EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{
					"limit_quota": config.LimitQuota, "updated_at": now,
				}).Error; err != nil {
					return err
				}
			}
			// 额度上调或阈值变化后，本期的预警应按新口径重新生效；用尽通知不重置（额度不足仍是事实）
			if config.LimitQuota > period.LimitQuota || config.AlertPercent != enterprise.CreditAlertPercent {
				if err := resetCreditNotifyTx(tx, period.Id, CreditNotifyKindWarn); err != nil {
					return err
				}
			}
		}
		detail, _ := common.Marshal(map[string]any{"before": previous, "after": map[string]any{
			"billing_mode": EnterpriseBillingModeCredit, "cycle_type": config.CycleType,
			"cycle_days": config.CycleDays, "limit_quota": config.LimitQuota, "alert_percent": config.AlertPercent,
			"auto_reset": config.AutoReset,
		}})
		return recordEnterpriseLedger(tx, &EnterpriseLedgerEntry{
			EnterpriseId: enterpriseId,
			Type:         EnterpriseLedgerCreditLimitChange,
			RefType:      "credit_period",
			RefId:        periodId,
			OperatorId:   operatorId,
			Detail:       JSONValue(detail),
		})
	})
	if err == nil {
		InvalidateEnterpriseBillingInfoByEnterprise(enterpriseId)
	}
	return err
}

// SwitchEnterpriseToPrepaid 授信切回预付：当前 open 期转为 closing，交给出账任务结算
func SwitchEnterpriseToPrepaid(enterpriseId int, operatorId int) error {
	err := DB.Transaction(func(tx *gorm.DB) error {
		enterprise, err := lockEnterprise(tx, enterpriseId)
		if err != nil {
			return err
		}
		if enterprise.BillingMode == EnterpriseBillingModePrepaid {
			return nil
		}
		now := common.GetTimestamp()
		if err := tx.Model(&EnterpriseCreditPeriod{}).
			Where("enterprise_id = ? AND status = ?", enterpriseId, EnterpriseCreditPeriodOpen).
			Updates(map[string]any{"status": EnterpriseCreditPeriodClosing, "closed_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
		if err := tx.Model(&Enterprise{}).Where("id = ?", enterpriseId).Updates(map[string]any{
			"billing_mode": EnterpriseBillingModePrepaid, "updated_at": now,
		}).Error; err != nil {
			return err
		}
		detail, _ := common.Marshal(map[string]any{"before": map[string]any{"billing_mode": EnterpriseBillingModeCredit}, "after": map[string]any{"billing_mode": EnterpriseBillingModePrepaid}})
		return recordEnterpriseLedger(tx, &EnterpriseLedgerEntry{
			EnterpriseId: enterpriseId, Type: EnterpriseLedgerCreditLimitChange, OperatorId: operatorId, Detail: JSONValue(detail),
		})
	})
	if err == nil {
		InvalidateEnterpriseBillingInfoByEnterprise(enterpriseId)
	}
	return err
}

// SetEnterpriseStatus 停用/启用企业；停用后名下 key 的请求在计费入口被拒绝
func SetEnterpriseStatus(enterpriseId int, status string) error {
	if status != EnterpriseStatusActive && status != EnterpriseStatusSuspended {
		return fmt.Errorf("invalid enterprise status: %s", status)
	}
	result := DB.Model(&Enterprise{}).Where("id = ?", enterpriseId).Updates(map[string]any{"status": status, "updated_at": common.GetTimestamp()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrEnterpriseResourceNotFound
	}
	InvalidateEnterpriseBillingInfoByEnterprise(enterpriseId)
	return nil
}

// registerEnterpriseTopupTx 预付企业的线下充值（事务内）：锁企业行、校验预付模式、加主账号余额（钱包上限守卫）、写 topup 台账。
// 对外入口是 RegisterManualTopUp：企业主与普通用户共用同一条管理员手动充值路径，订单 / 充值日志 / 审计一致，
// 这里只补企业特有的台账与模式校验。调用方负责事务提交后的余额缓存同步。
func registerEnterpriseTopupTx(tx *gorm.DB, enterpriseId int, amountQuota int, operatorId int, reference string, remark string) (*EnterpriseLedgerEntry, error) {
	if amountQuota <= 0 {
		return nil, errors.New("top-up amount must be positive")
	}
	if err := common.ValidateWalletQuota(amountQuota); err != nil {
		return nil, err
	}
	enterprise, err := lockEnterprise(tx, enterpriseId)
	if err != nil {
		return nil, err
	}
	if enterprise.BillingMode != EnterpriseBillingModePrepaid {
		return nil, ErrEnterpriseNotPrepaid
	}
	result := tx.Model(&User{}).Where("id = ? AND quota <= ?", enterprise.UserId, common.MaxWalletQuota-amountQuota).
		Update("quota", gorm.Expr("quota + ?", amountQuota))
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected != 1 {
		return nil, ErrWalletQuotaLimitExceeded
	}
	entry := &EnterpriseLedgerEntry{
		EnterpriseId: enterpriseId,
		Type:         EnterpriseLedgerTopup,
		AmountQuota:  int64(amountQuota),
		OperatorId:   operatorId,
		Reference:    reference,
		Remark:       remark,
	}
	if err := tx.Model(&User{}).Where("id = ?", enterprise.UserId).Select("quota").Scan(&entry.BalanceAfterQuota).Error; err != nil {
		return nil, err
	}
	if err := recordEnterpriseLedger(tx, entry); err != nil {
		return nil, err
	}
	return entry, nil
}

// ListEnterpriseLedger 企业账本分页；entryType 为空不限，可用逗号给多个类型；start / end 为秒级时间戳，区间 [start, end)，0 表示该端不限
func ListEnterpriseLedger(enterpriseId int, entryType string, start int64, end int64, startIdx int, num int) ([]*EnterpriseLedgerEntry, int64, error) {
	query := DB.Model(&EnterpriseLedgerEntry{}).Where("enterprise_id = ?", enterpriseId)
	if entryType != "" {
		types := make([]string, 0, 4)
		for entry := range strings.SplitSeq(entryType, ",") {
			if entry = strings.TrimSpace(entry); entry != "" {
				types = append(types, entry)
			}
		}
		query = query.Where("type IN ?", types)
	}
	if start > 0 {
		query = query.Where("created_at >= ?", start)
	}
	if end > 0 {
		query = query.Where("created_at < ?", end)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	entries := make([]*EnterpriseLedgerEntry, 0)
	err := query.Order("id DESC").Limit(num).Offset(startIdx).Find(&entries).Error
	return entries, total, err
}

func ListEnterpriseCreditPeriods(enterpriseId int, startIdx int, num int) ([]*EnterpriseCreditPeriod, int64, error) {
	query := DB.Model(&EnterpriseCreditPeriod{}).Where("enterprise_id = ?", enterpriseId)
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	periods := make([]*EnterpriseCreditPeriod, 0)
	err := query.Order("period_no DESC").Limit(num).Offset(startIdx).Find(&periods).Error
	return periods, total, err
}

// RolloverDueCreditPeriods 把已到期的 open 期滚动到下一期（定时任务调用，幂等）。
// 额度信用期（end_at=0）不按时间滚动；结算补扣推过额度但之后没有新请求触发翻转的，由这里兜底翻转。
func RolloverDueCreditPeriods(now int64) (int, error) {
	var enterpriseIds []int
	err := DB.Model(&EnterpriseCreditPeriod{}).
		Where("status = ? AND end_at > 0 AND end_at <= ?", EnterpriseCreditPeriodOpen, now).
		Distinct().Pluck("enterprise_id", &enterpriseIds).Error
	if err != nil {
		return 0, err
	}
	rolled := 0
	for _, enterpriseId := range enterpriseIds {
		if _, err := EnsureOpenCreditPeriod(enterpriseId); err != nil {
			if errors.Is(err, ErrEnterpriseNotCredit) {
				continue
			}
			return rolled, err
		}
		rolled++
	}
	var exhausted []struct {
		Id           int64
		EnterpriseId int
	}
	err = DB.Table("ent_credit_periods p").
		Joins("JOIN enterprises e ON e.id = p.enterprise_id").
		Where("p.status = ? AND e.billing_mode = ? AND e.credit_cycle_type = ? AND p.limit_quota > 0 AND p.used_quota >= p.limit_quota",
			EnterpriseCreditPeriodOpen, EnterpriseBillingModeCredit, EnterpriseCreditCycleQuotaBased).
		Select("p.id, p.enterprise_id").Scan(&exhausted).Error
	if err != nil {
		return rolled, err
	}
	for _, period := range exhausted {
		if _, ok, err := RolloverExhaustedCreditPeriod(period.EnterpriseId, period.Id); err != nil {
			return rolled, err
		} else if ok {
			rolled++
		}
	}
	return rolled, nil
}

// ---------------------------------------------------------------------------
// 计费入口用的企业信息缓存（进程内，短 TTL；额度判断不依赖它，始终以 SQL 条件为准）
// ---------------------------------------------------------------------------

// EnterpriseBillingInfo 计费入口需要的最小企业信息
type EnterpriseBillingInfo struct {
	EnterpriseId       int
	BillingMode        string
	Status             string
	OpenPeriodId       int64
	CreditAlertPercent int
	// TeamBudgets 设了月度预算的团队（team_id -> 预算配置）；没有时为 nil，计费入口只多一次 map 读
	TeamBudgets map[int]EnterpriseTeamBudget
}

const enterpriseBillingInfoTTL = 15 * time.Second

type enterpriseBillingInfoEntry struct {
	info      *EnterpriseBillingInfo // nil 表示非企业用户（负缓存）
	expiresAt time.Time
}

var enterpriseBillingInfoCache sync.Map // user_id -> enterpriseBillingInfoEntry

func loadEnterpriseBillingInfo(userId int) (*EnterpriseBillingInfo, error) {
	var enterprise Enterprise
	err := DB.Select("id", "billing_mode", "status", "credit_alert_percent").Where("user_id = ?", userId).First(&enterprise).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	info := &EnterpriseBillingInfo{EnterpriseId: enterprise.Id, BillingMode: enterprise.BillingMode, Status: enterprise.Status, CreditAlertPercent: enterprise.CreditAlertPercent}
	if enterprise.BillingMode == EnterpriseBillingModeCredit {
		var periodId int64
		err := DB.Model(&EnterpriseCreditPeriod{}).Where("enterprise_id = ? AND status = ?", enterprise.Id, EnterpriseCreditPeriodOpen).
			Select("COALESCE(MAX(id), 0)").Scan(&periodId).Error
		if err != nil {
			return nil, err
		}
		info.OpenPeriodId = periodId
	}
	budgets, err := loadEnterpriseTeamBudgets(enterprise.Id)
	if err != nil {
		return nil, err
	}
	info.TeamBudgets = budgets
	return info, nil
}

// GetEnterpriseBillingInfo 返回用户所属企业的计费信息；非企业用户返回 nil, nil
func GetEnterpriseBillingInfo(userId int) (*EnterpriseBillingInfo, error) {
	if DB == nil {
		return nil, nil
	}
	if cached, ok := enterpriseBillingInfoCache.Load(userId); ok {
		entry := cached.(enterpriseBillingInfoEntry)
		if time.Now().Before(entry.expiresAt) {
			return entry.info, nil
		}
	}
	info, err := loadEnterpriseBillingInfo(userId)
	if err != nil {
		// 企业表尚未建立（例如未迁移的测试库）时按非企业用户处理，不影响普通计费
		if !DB.Migrator().HasTable(&Enterprise{}) {
			info, err = nil, nil
		} else {
			return nil, err
		}
	}
	enterpriseBillingInfoCache.Store(userId, enterpriseBillingInfoEntry{info: info, expiresAt: time.Now().Add(enterpriseBillingInfoTTL)})
	return info, nil
}

func InvalidateEnterpriseBillingInfo(userId int) {
	enterpriseBillingInfoCache.Delete(userId)
}

// InvalidateEnterpriseBillingInfoByEnterprise 企业配置变更后失效其主账号的缓存（多副本下其余节点最多延迟一个 TTL）
func InvalidateEnterpriseBillingInfoByEnterprise(enterpriseId int) {
	var userId int
	if err := DB.Model(&Enterprise{}).Where("id = ?", enterpriseId).Select("user_id").Scan(&userId).Error; err == nil && userId > 0 {
		InvalidateEnterpriseBillingInfo(userId)
	}
}
