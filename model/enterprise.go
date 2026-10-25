package model

import (
	"database/sql/driver"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// 企业计费模式
const (
	EnterpriseBillingModePrepaid = "prepaid" // 预付：使用主账号钱包余额，线下转账由管理员登记充值
	EnterpriseBillingModeCredit  = "credit"  // 授信：按账期额度消费，账期结束出账
)

// 授信周期类型
const (
	EnterpriseCreditCycleNaturalMonth = "natural_month"
	EnterpriseCreditCycleFixedDays    = "fixed_days"
)

// 企业状态
const (
	EnterpriseStatusActive    = "active"
	EnterpriseStatusSuspended = "suspended"
)

// 用户列表的用户类型过滤
const (
	UserTypePersonal   = "personal"
	UserTypeEnterprise = "enterprise"
)

const (
	EnterpriseDefaultPaymentTermsDays = 15
	EnterpriseDefaultCurrency         = "USD"
)

var (
	ErrEnterpriseAlreadyExists   = errors.New("user is already an enterprise account")
	ErrEnterpriseUserNotEligible = errors.New("only active common users can be upgraded to enterprise accounts")
)

// EnterpriseBillingProfile 企业开票抬头，出账时快照进账单
type EnterpriseBillingProfile struct {
	CompanyName  string `json:"company_name"`
	Address      string `json:"address"`
	TaxId        string `json:"tax_id"`
	BillingEmail string `json:"billing_email"`
	Phone        string `json:"phone"`
	Country      string `json:"country"`
}

// Value 必须返回 string：PG simple protocol 下 []byte 会按 bytea 编码导致写 json 列失败
func (p EnterpriseBillingProfile) Value() (driver.Value, error) {
	b, err := common.Marshal(p)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (p *EnterpriseBillingProfile) Scan(value any) error {
	switch v := value.(type) {
	case nil:
		*p = EnterpriseBillingProfile{}
		return nil
	case []byte:
		return common.Unmarshal(v, p)
	case string:
		return common.UnmarshalJsonStr(v, p)
	default:
		return fmt.Errorf("unsupported billing profile type: %T", value)
	}
}

// Enterprise 企业资料，与企业主账号（users 行）1:1。
// 是否企业账号只由本表决定，不在 users 表上加字段，以减少与上游的合并冲突。
type Enterprise struct {
	Id               int                      `json:"id"`
	UserId           int                      `json:"user_id" gorm:"uniqueIndex;not null"`
	Name             string                   `json:"name" gorm:"type:varchar(128);not null;index"`
	ContactName      string                   `json:"contact_name" gorm:"type:varchar(64);not null;default:''"`
	ContactEmail     string                   `json:"contact_email" gorm:"type:varchar(128);not null;default:''"`
	ContactPhone     string                   `json:"contact_phone" gorm:"type:varchar(32);not null;default:''"`
	BillingMode      string                   `json:"billing_mode" gorm:"type:varchar(16);not null;index"`
	CreditCycleType  string                   `json:"credit_cycle_type" gorm:"type:varchar(16);not null;default:''"`
	CreditCycleDays  int                      `json:"credit_cycle_days" gorm:"not null;default:0"`
	CreditLimitQuota int64                    `json:"credit_limit_quota" gorm:"not null;default:0"`
	CreditAnchorAt   int64                    `json:"credit_anchor_at" gorm:"not null;default:0"`
	PaymentTermsDays int                      `json:"payment_terms_days" gorm:"not null;default:15"`
	Currency         string                   `json:"currency" gorm:"type:varchar(8);not null;default:'USD'"`
	BillingProfile   EnterpriseBillingProfile `json:"billing_profile" gorm:"type:jsonb"`
	Status           string                   `json:"status" gorm:"type:varchar(16);not null;index"`
	Remark           string                   `json:"remark" gorm:"type:text"`
	CreatedAt        int64                    `json:"created_at" gorm:"not null"`
	UpdatedAt        int64                    `json:"updated_at" gorm:"not null"`
}

// EnterpriseListItem 管理员企业客户列表行：企业资料 + 主账号摘要 + 授信企业的当前账期额度（预付企业为 0）
type EnterpriseListItem struct {
	Enterprise
	Username         string `json:"username"`
	DisplayName      string `json:"display_name"`
	Email            string `json:"email"`
	Quota            int    `json:"quota"`
	UsedQuota        int    `json:"used_quota"`
	UserStatus       int    `json:"user_status"`
	PeriodLimitQuota int64  `json:"period_limit_quota"`
	PeriodUsedQuota  int64  `json:"period_used_quota"`
	PeriodStartAt    int64  `json:"period_start_at"`
	PeriodEndAt      int64  `json:"period_end_at"`
}

// Normalize 校验并补齐默认值，创建和更新前都要调用
func (e *Enterprise) Normalize() error {
	e.Name = strings.TrimSpace(e.Name)
	e.ContactName = strings.TrimSpace(e.ContactName)
	e.ContactEmail = strings.TrimSpace(e.ContactEmail)
	e.ContactPhone = strings.TrimSpace(e.ContactPhone)
	if e.Name == "" || len([]rune(e.Name)) > 128 {
		return errors.New("enterprise name is required and must be at most 128 characters")
	}
	if len(e.ContactName) > 64 || len(e.ContactEmail) > 128 || len(e.ContactPhone) > 32 {
		return errors.New("contact fields are too long")
	}
	if e.BillingMode == "" {
		e.BillingMode = EnterpriseBillingModePrepaid
	}
	if e.BillingMode != EnterpriseBillingModePrepaid && e.BillingMode != EnterpriseBillingModeCredit {
		return fmt.Errorf("invalid billing mode: %s", e.BillingMode)
	}
	if e.PaymentTermsDays == 0 {
		e.PaymentTermsDays = EnterpriseDefaultPaymentTermsDays
	}
	if e.PaymentTermsDays < 1 || e.PaymentTermsDays > 365 {
		return errors.New("payment terms days must be between 1 and 365")
	}
	if e.Currency == "" {
		e.Currency = EnterpriseDefaultCurrency
	}
	if e.Status == "" {
		e.Status = EnterpriseStatusActive
	}
	if e.Status != EnterpriseStatusActive && e.Status != EnterpriseStatusSuspended {
		return fmt.Errorf("invalid enterprise status: %s", e.Status)
	}
	return nil
}

// EnterpriseUserTypeScope 按用户类型过滤 users 查询：personal 排除企业主账号，enterprise 只保留企业主账号
func EnterpriseUserTypeScope(userType string) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		switch userType {
		case UserTypePersonal:
			return tx.Where("NOT EXISTS (SELECT 1 FROM enterprises WHERE enterprises.user_id = users.id)")
		case UserTypeEnterprise:
			return tx.Where("EXISTS (SELECT 1 FROM enterprises WHERE enterprises.user_id = users.id)")
		default:
			return tx
		}
	}
}

func GetEnterpriseById(id int) (*Enterprise, error) {
	var enterprise Enterprise
	if err := DB.First(&enterprise, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &enterprise, nil
}

func GetEnterpriseByUserId(userId int) (*Enterprise, error) {
	var enterprise Enterprise
	if err := DB.First(&enterprise, "user_id = ?", userId).Error; err != nil {
		return nil, err
	}
	return &enterprise, nil
}

// ListEnterprises 管理员企业客户列表，keyword 匹配企业名、联系人、主账号用户名/邮箱，或精确匹配企业 ID
func ListEnterprises(keyword string, billingMode string, startIdx int, num int) ([]*EnterpriseListItem, int64, error) {
	// open 账期每个企业至多一行（部分唯一索引 uk_ent_period_open），左联不会放大行数
	query := DB.Table("enterprises").
		Joins("JOIN users ON users.id = enterprises.user_id").
		Joins("LEFT JOIN ent_credit_periods open_period ON open_period.enterprise_id = enterprises.id AND open_period.status = ?", EnterpriseCreditPeriodOpen)
	keyword = strings.TrimSpace(keyword)
	if keyword != "" {
		like := "%" + keyword + "%"
		condition := "enterprises.name ILIKE ? OR enterprises.contact_name ILIKE ? OR enterprises.contact_email ILIKE ? OR users.username ILIKE ? OR users.email ILIKE ?"
		args := []any{like, like, like, like, like}
		if id, err := strconv.Atoi(keyword); err == nil {
			condition = "enterprises.id = ? OR " + condition
			args = append([]any{id}, args...)
		}
		query = query.Where("("+condition+")", args...)
	}
	if billingMode != "" {
		query = query.Where("enterprises.billing_mode = ?", billingMode)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]*EnterpriseListItem, 0)
	err := query.
		Select("enterprises.*, users.username, users.display_name, users.email, users.quota, users.used_quota, users.status AS user_status, " +
			"COALESCE(open_period.limit_quota, 0) AS period_limit_quota, COALESCE(open_period.used_quota, 0) AS period_used_quota, " +
			"COALESCE(open_period.start_at, 0) AS period_start_at, COALESCE(open_period.end_at, 0) AS period_end_at").
		Order("enterprises.id DESC").
		Limit(num).Offset(startIdx).
		Scan(&items).Error
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// CreateEnterpriseWithNewUser 新建企业主账号并创建企业资料（同一事务）。
// 企业主账号不发放新用户赠送额度，预付余额只能由管理员登记线下转账充值。
func CreateEnterpriseWithNewUser(user *User, enterprise *Enterprise) error {
	if err := enterprise.Normalize(); err != nil {
		return err
	}
	user.Role = common.RoleCommonUser
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := user.InsertWithTx(tx, 0); err != nil {
			return err
		}
		if err := tx.Model(&User{}).Where("id = ?", user.Id).Update("quota", 0).Error; err != nil {
			return err
		}
		user.Quota = 0
		now := common.GetTimestamp()
		enterprise.Id = 0
		enterprise.UserId = user.Id
		enterprise.CreatedAt = now
		enterprise.UpdatedAt = now
		if err := tx.Create(enterprise).Error; err != nil {
			return err
		}
		_, err := ensureDefaultTeam(tx, enterprise.Id)
		return err
	})
	if err != nil {
		return err
	}
	user.FinishInsert(0)
	return nil
}

// UpgradeUserToEnterprise 把已有的普通用户升级为企业主账号，保留其现有余额与历史
func UpgradeUserToEnterprise(userId int, enterprise *Enterprise) error {
	if err := enterprise.Normalize(); err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, "id = ?", userId).Error; err != nil {
			return err
		}
		if user.Role != common.RoleCommonUser || user.Status != common.UserStatusEnabled {
			return ErrEnterpriseUserNotEligible
		}
		var count int64
		if err := tx.Model(&Enterprise{}).Where("user_id = ?", userId).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrEnterpriseAlreadyExists
		}
		now := common.GetTimestamp()
		enterprise.Id = 0
		enterprise.UserId = userId
		enterprise.CreatedAt = now
		enterprise.UpdatedAt = now
		if err := tx.Create(enterprise).Error; err != nil {
			return err
		}
		_, err := ensureDefaultTeam(tx, enterprise.Id)
		return err
	})
}

// UpdateEnterpriseProfile 更新企业资料（不含计费模式与授信配置，授信由专门接口维护）
func UpdateEnterpriseProfile(enterprise *Enterprise) error {
	if err := enterprise.Normalize(); err != nil {
		return err
	}
	return DB.Model(&Enterprise{}).Where("id = ?", enterprise.Id).Updates(map[string]any{
		"name":               enterprise.Name,
		"contact_name":       enterprise.ContactName,
		"contact_email":      enterprise.ContactEmail,
		"contact_phone":      enterprise.ContactPhone,
		"payment_terms_days": enterprise.PaymentTermsDays,
		"billing_profile":    enterprise.BillingProfile,
		"remark":             enterprise.Remark,
		"updated_at":         common.GetTimestamp(),
	}).Error
}
