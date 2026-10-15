package model

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
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
}

func (c EnterpriseCreditConfig) validate() error {
	switch c.CycleType {
	case EnterpriseCreditCycleNaturalMonth:
	case EnterpriseCreditCycleFixedDays:
		if c.CycleDays < 1 || c.CycleDays > 366 {
			return fmt.Errorf("%w: cycle days must be between 1 and 366", ErrEnterpriseCreditConfig)
		}
	default:
		return fmt.Errorf("%w: unknown cycle type %q", ErrEnterpriseCreditConfig, c.CycleType)
	}
	if c.LimitQuota < 0 || c.LimitQuota > common.MaxWalletQuota {
		return fmt.Errorf("%w: credit limit out of range", ErrEnterpriseCreditConfig)
	}
	return nil
}

// creditPeriodBounds 计算包含 now 的账期区间 [start, end)
func creditPeriodBounds(cycleType string, cycleDays int, anchorAt int64, now int64) (int64, int64) {
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
		if now < open.EndAt {
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
		// 相邻周期保持连续：新期从上期结束时刻开始（除非系统停摆太久已跨过多个周期）
		if startAt <= open.EndAt {
			startAt = open.EndAt
		}
	} else {
		var maxNo int
		if err := tx.Model(&EnterpriseCreditPeriod{}).Where("enterprise_id = ?", enterprise.Id).Select("COALESCE(MAX(period_no), 0)").Scan(&maxNo).Error; err != nil {
			return nil, err
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

// AddCreditUsage 原子更新账期用量。enforceLimit=true 时只在 open 期且不超额度时生效（预扣）；
// 否则在 open/closing 期上无条件累加（结算差额、退款）。返回是否命中并更新。
func AddCreditUsage(periodId int64, delta int64, inflightDelta int, enforceLimit bool) (bool, error) {
	query := DB.Model(&EnterpriseCreditPeriod{}).Where("id = ?", periodId)
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
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

// ApplyCreditSettlement 把结算差额记回预扣时的账期；该期已出账时记入当前 open 期并写跨期调整流水
func ApplyCreditSettlement(enterpriseId int, periodId int64, delta int64, inflightDelta int) error {
	applied, err := AddCreditUsage(periodId, delta, inflightDelta, false)
	if err != nil || applied {
		return err
	}
	if delta == 0 {
		return nil
	}
	open, err := EnsureOpenCreditPeriod(enterpriseId)
	if err != nil {
		return fmt.Errorf("period %d is billed and no open period to carry delta %d: %w", periodId, delta, err)
	}
	if _, err := AddCreditUsage(open.Id, delta, 0, false); err != nil {
		return err
	}
	return recordEnterpriseLedger(DB, &EnterpriseLedgerEntry{
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
		}
		updates := map[string]any{
			"billing_mode":       EnterpriseBillingModeCredit,
			"credit_cycle_type":  config.CycleType,
			"credit_cycle_days":  config.CycleDays,
			"credit_limit_quota": config.LimitQuota,
			"updated_at":         now,
		}
		if enterprise.CreditAnchorAt == 0 || enterprise.BillingMode != EnterpriseBillingModeCredit {
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
		period, err := ensureOpenCreditPeriodTx(tx, enterprise, now)
		if err != nil {
			return err
		}
		if period.LimitQuota != config.LimitQuota {
			if err := tx.Model(&EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{
				"limit_quota": config.LimitQuota, "updated_at": now,
			}).Error; err != nil {
				return err
			}
		}
		detail, _ := common.Marshal(map[string]any{"before": previous, "after": map[string]any{
			"billing_mode": EnterpriseBillingModeCredit, "cycle_type": config.CycleType,
			"cycle_days": config.CycleDays, "limit_quota": config.LimitQuota,
		}})
		return recordEnterpriseLedger(tx, &EnterpriseLedgerEntry{
			EnterpriseId: enterpriseId,
			Type:         EnterpriseLedgerCreditLimitChange,
			RefType:      "credit_period",
			RefId:        period.Id,
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

// RegisterEnterpriseTopup 预付企业登记线下充值：加余额并写流水（同一事务）
func RegisterEnterpriseTopup(enterpriseId int, amountQuota int, operatorId int, reference string, remark string) (*EnterpriseLedgerEntry, error) {
	if amountQuota <= 0 {
		return nil, errors.New("top-up amount must be positive")
	}
	if err := common.ValidateWalletQuota(amountQuota); err != nil {
		return nil, err
	}
	entry := &EnterpriseLedgerEntry{
		EnterpriseId: enterpriseId,
		Type:         EnterpriseLedgerTopup,
		AmountQuota:  int64(amountQuota),
		OperatorId:   operatorId,
		Reference:    reference,
		Remark:       remark,
	}
	var userId int
	err := DB.Transaction(func(tx *gorm.DB) error {
		enterprise, err := lockEnterprise(tx, enterpriseId)
		if err != nil {
			return err
		}
		if enterprise.BillingMode != EnterpriseBillingModePrepaid {
			return ErrEnterpriseNotPrepaid
		}
		userId = enterprise.UserId
		result := tx.Model(&User{}).Where("id = ? AND quota <= ?", userId, common.MaxWalletQuota-amountQuota).
			Update("quota", gorm.Expr("quota + ?", amountQuota))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrWalletQuotaLimitExceeded
		}
		var balance int64
		if err := tx.Model(&User{}).Where("id = ?", userId).Select("quota").Scan(&balance).Error; err != nil {
			return err
		}
		entry.BalanceAfterQuota = balance
		return recordEnterpriseLedger(tx, entry)
	})
	if err != nil {
		return nil, err
	}
	// 事务已提交，把增量补进余额缓存，避免缓存过期前新额度不可用
	if cacheErr := cacheIncrUserQuota(userId, int64(amountQuota)); cacheErr != nil {
		common.SysLog("failed to sync enterprise top-up to user quota cache: " + cacheErr.Error())
	}
	return entry, nil
}

func ListEnterpriseLedger(enterpriseId int, entryType string, startIdx int, num int) ([]*EnterpriseLedgerEntry, int64, error) {
	query := DB.Model(&EnterpriseLedgerEntry{}).Where("enterprise_id = ?", enterpriseId)
	if entryType != "" {
		query = query.Where("type = ?", entryType)
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

// RolloverDueCreditPeriods 把已到期的 open 期滚动到下一期（定时任务调用，幂等）
func RolloverDueCreditPeriods(now int64) (int, error) {
	var enterpriseIds []int
	err := DB.Model(&EnterpriseCreditPeriod{}).
		Where("status = ? AND end_at <= ?", EnterpriseCreditPeriodOpen, now).
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
	return rolled, nil
}

// ---------------------------------------------------------------------------
// 计费入口用的企业信息缓存（进程内，短 TTL；额度判断不依赖它，始终以 SQL 条件为准）
// ---------------------------------------------------------------------------

// EnterpriseBillingInfo 计费入口需要的最小企业信息
type EnterpriseBillingInfo struct {
	EnterpriseId int
	BillingMode  string
	Status       string
	OpenPeriodId int64
}

const enterpriseBillingInfoTTL = 15 * time.Second

type enterpriseBillingInfoEntry struct {
	info      *EnterpriseBillingInfo // nil 表示非企业用户（负缓存）
	expiresAt time.Time
}

var enterpriseBillingInfoCache sync.Map // user_id -> enterpriseBillingInfoEntry

func loadEnterpriseBillingInfo(userId int) (*EnterpriseBillingInfo, error) {
	var enterprise Enterprise
	err := DB.Select("id", "billing_mode", "status").Where("user_id = ?", userId).First(&enterprise).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	info := &EnterpriseBillingInfo{EnterpriseId: enterprise.Id, BillingMode: enterprise.BillingMode, Status: enterprise.Status}
	if enterprise.BillingMode == EnterpriseBillingModeCredit {
		var periodId int64
		err := DB.Model(&EnterpriseCreditPeriod{}).Where("enterprise_id = ? AND status = ?", enterprise.Id, EnterpriseCreditPeriodOpen).
			Select("COALESCE(MAX(id), 0)").Scan(&periodId).Error
		if err != nil {
			return nil, err
		}
		info.OpenPeriodId = periodId
	}
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
