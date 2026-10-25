package model

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// 推广人（TokenFunc 二开，仅 PostgreSQL）。身份与归属用独立表，不动上游 users：
//   - tf_promoters：谁是推广人（软移除，removed_at 非空即历史记录）
//   - tf_promoter_bindings：用户归属哪个推广人（软解绑；同一用户同一时刻至多一条活跃绑定）
//
// usage_since 决定统计口径：0 = 该用户全历史消耗都算给推广人；>0 = 从该时间所在的上海日起算。
// 推广链接注册自动绑定按全历史；管理员手动绑定默认从绑定当天起，勾选「包含历史消耗」才为 0。

const (
	PromoterBindingSourceRegister = "register"
	PromoterBindingSourceAdmin    = "admin"
)

type Promoter struct {
	Id        int    `json:"id"`
	UserId    int    `json:"user_id" gorm:"not null;uniqueIndex:uk_tf_promoter_active,where:removed_at IS NULL"`
	Remark    string `json:"remark" gorm:"type:varchar(255);not null;default:''"`
	CreatedBy int    `json:"created_by" gorm:"not null;default:0"`
	CreatedAt int64  `json:"created_at" gorm:"not null;default:0"`
	UpdatedAt int64  `json:"updated_at" gorm:"not null;default:0"`
	RemovedAt *int64 `json:"removed_at"`
	RemovedBy int    `json:"removed_by" gorm:"not null;default:0"`
}

func (Promoter) TableName() string { return "tf_promoters" }

type PromoterBinding struct {
	Id             int    `json:"id"`
	PromoterUserId int    `json:"promoter_user_id" gorm:"not null;index:idx_tf_promoter_binding_promoter,priority:1"`
	UserId         int    `json:"user_id" gorm:"not null;uniqueIndex:uk_tf_promoter_binding_active,where:unbound_at IS NULL"`
	Source         string `json:"source" gorm:"type:varchar(16);not null;default:''"`
	BoundBy        int    `json:"bound_by" gorm:"not null;default:0"`
	BoundAt        int64  `json:"bound_at" gorm:"not null;default:0"`
	UsageSince     int64  `json:"usage_since" gorm:"not null;default:0"`
	UnboundAt      *int64 `json:"unbound_at" gorm:"index:idx_tf_promoter_binding_promoter,priority:2"`
	UnboundBy      int    `json:"unbound_by" gorm:"not null;default:0"`
}

func (PromoterBinding) TableName() string { return "tf_promoter_bindings" }

// PromoterUserBrief 推广人 / 绑定用户在列表里需要的用户信息（含软删用户，用于打「已注销」标）
type PromoterUserBrief struct {
	Id          int    `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
	Role        int    `json:"role"`
	Group       string `json:"group"`
	Deleted     bool   `json:"deleted"`
}

// GetActivePromoterByUserId 当前是推广人的记录；不是则 gorm.ErrRecordNotFound
func GetActivePromoterByUserId(userId int) (*Promoter, error) {
	var promoter Promoter
	if err := DB.Where("user_id = ? AND removed_at IS NULL", userId).First(&promoter).Error; err != nil {
		return nil, err
	}
	return &promoter, nil
}

// GetActivePromoterById 按 tf_promoters.id 取活跃推广人
func GetActivePromoterById(id int) (*Promoter, error) {
	var promoter Promoter
	if err := DB.Where("id = ? AND removed_at IS NULL", id).First(&promoter).Error; err != nil {
		return nil, err
	}
	return &promoter, nil
}

// ListActivePromoters 推广人分页列表；keyword 匹配用户名 / 显示名 / 邮箱 / 备注，纯数字时同时匹配用户 ID
func ListActivePromoters(keyword string, startIdx int, num int) ([]*Promoter, int64, error) {
	query := DB.Model(&Promoter{}).Where("tf_promoters.removed_at IS NULL")
	keyword = strings.TrimSpace(keyword)
	if keyword != "" {
		pattern := "%" + keyword + "%"
		sub := DB.Unscoped().Model(&User{}).Select("id").
			Where("username ILIKE ? OR display_name ILIKE ? OR email ILIKE ?", pattern, pattern, pattern)
		condition := "tf_promoters.remark ILIKE ? OR tf_promoters.user_id IN (?)"
		args := []any{pattern, sub}
		if id, err := strconv.Atoi(keyword); err == nil && id > 0 {
			condition += " OR tf_promoters.user_id = ?"
			args = append(args, id)
		}
		query = query.Where("("+condition+")", args...)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	promoters := make([]*Promoter, 0)
	if err := query.Order("tf_promoters.id DESC").Offset(startIdx).Limit(num).Find(&promoters).Error; err != nil {
		return nil, 0, err
	}
	return promoters, total, nil
}

// ListAllActivePromoterUserIds 全部活跃推广人的 user_id（管理端月度汇总用）
func ListAllActivePromoterUserIds() ([]int, error) {
	ids := make([]int, 0)
	err := DB.Model(&Promoter{}).Where("removed_at IS NULL").Pluck("user_id", &ids).Error
	return ids, err
}

// CreatePromoter 新增推广人；活跃记录已存在时返回唯一冲突错误，由调用方翻译
func CreatePromoter(promoter *Promoter) error {
	return DB.Create(promoter).Error
}

// RemovePromoterWithBindings 一个事务内软移除推广人并解绑名下全部活跃用户；返回解绑数
func RemovePromoterWithBindings(promoter *Promoter, operatorId int, now int64) (int64, error) {
	var unbound int64
	err := DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&Promoter{}).Where("id = ? AND removed_at IS NULL", promoter.Id).
			Updates(map[string]any{"removed_at": now, "removed_by": operatorId, "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		result = tx.Model(&PromoterBinding{}).Where("promoter_user_id = ? AND unbound_at IS NULL", promoter.UserId).
			Updates(map[string]any{"unbound_at": now, "unbound_by": operatorId})
		if result.Error != nil {
			return result.Error
		}
		unbound = result.RowsAffected
		return nil
	})
	return unbound, err
}

// GetActiveBindingByUserId 用户当前的归属；没有则 gorm.ErrRecordNotFound
func GetActiveBindingByUserId(userId int) (*PromoterBinding, error) {
	var binding PromoterBinding
	if err := DB.Where("user_id = ? AND unbound_at IS NULL", userId).First(&binding).Error; err != nil {
		return nil, err
	}
	return &binding, nil
}

// ListActiveBindings 某推广人名下全部活跃绑定，按绑定时间倒序
func ListActiveBindings(promoterUserId int) ([]*PromoterBinding, error) {
	bindings := make([]*PromoterBinding, 0)
	err := DB.Where("promoter_user_id = ? AND unbound_at IS NULL", promoterUserId).Order("bound_at DESC, id DESC").Find(&bindings).Error
	return bindings, err
}

// ListActiveBindingsByPromoters 若干推广人名下的活跃绑定（管理端月度汇总一次取全）
func ListActiveBindingsByPromoters(promoterUserIds []int) ([]*PromoterBinding, error) {
	bindings := make([]*PromoterBinding, 0)
	if len(promoterUserIds) == 0 {
		return bindings, nil
	}
	err := DB.Where("promoter_user_id IN ? AND unbound_at IS NULL", promoterUserIds).Find(&bindings).Error
	return bindings, err
}

// CountActiveBindingsByPromoters 每个推广人的活跃绑定数
func CountActiveBindingsByPromoters(promoterUserIds []int) (map[int]int64, error) {
	counts := make(map[int]int64, len(promoterUserIds))
	if len(promoterUserIds) == 0 {
		return counts, nil
	}
	var rows []struct {
		PromoterUserId int
		Count          int64
	}
	err := DB.Model(&PromoterBinding{}).Select("promoter_user_id, COUNT(*) AS count").
		Where("promoter_user_id IN ? AND unbound_at IS NULL", promoterUserIds).Group("promoter_user_id").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		counts[row.PromoterUserId] = row.Count
	}
	return counts, nil
}

// CreatePromoterBinding 新增绑定；活跃绑定已存在时返回唯一冲突错误
func CreatePromoterBinding(binding *PromoterBinding) error {
	return DB.Create(binding).Error
}

// UnbindPromoterBinding 软解绑；不存在活跃绑定时返回 gorm.ErrRecordNotFound
func UnbindPromoterBinding(promoterUserId int, userId int, operatorId int, now int64) error {
	result := DB.Model(&PromoterBinding{}).Where("promoter_user_id = ? AND user_id = ? AND unbound_at IS NULL", promoterUserId, userId).
		Updates(map[string]any{"unbound_at": now, "unbound_by": operatorId})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// BindPromoterOnRegister 推广链接注册后的自动绑定：邀请人是活跃推广人且新用户尚无归属时建一条全历史口径的绑定。
// 与邀请奖励无关，不受支付合规开关影响；任何失败只记日志，不影响注册。
func BindPromoterOnRegister(inviterId int, newUserId int) {
	if inviterId <= 0 || newUserId <= 0 || inviterId == newUserId {
		return
	}
	if _, err := GetActivePromoterByUserId(inviterId); err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			common.SysError("promoter auto-bind: load promoter failed: " + err.Error())
		}
		return
	}
	if _, err := GetActiveBindingByUserId(newUserId); err == nil {
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		common.SysError("promoter auto-bind: load binding failed: " + err.Error())
		return
	}
	binding := &PromoterBinding{
		PromoterUserId: inviterId, UserId: newUserId, Source: PromoterBindingSourceRegister,
		BoundBy: 0, BoundAt: common.GetTimestamp(), UsageSince: 0,
	}
	if err := CreatePromoterBinding(binding); err != nil {
		common.SysError("promoter auto-bind: create binding failed: " + err.Error())
	}
}

// GetPromoterUserBriefs 含软删用户的简要信息，键为用户 id
func GetPromoterUserBriefs(userIds []int) (map[int]*PromoterUserBrief, error) {
	briefs := make(map[int]*PromoterUserBrief, len(userIds))
	if len(userIds) == 0 {
		return briefs, nil
	}
	var rows []struct {
		Id          int
		Username    string
		DisplayName string
		Email       string
		Role        int
		Group       string
		DeletedAt   gorm.DeletedAt
	}
	const batch = 500
	for start := 0; start < len(userIds); start += batch {
		var chunk []struct {
			Id          int
			Username    string
			DisplayName string
			Email       string
			Role        int
			Group       string
			DeletedAt   gorm.DeletedAt
		}
		err := DB.Unscoped().Model(&User{}).Select("id, username, display_name, email, role, "+commonGroupCol+", deleted_at").
			Where("id IN ?", userIds[start:min(start+batch, len(userIds))]).Scan(&chunk).Error
		if err != nil {
			return nil, err
		}
		rows = append(rows, chunk...)
	}
	for _, row := range rows {
		briefs[row.Id] = &PromoterUserBrief{
			Id: row.Id, Username: row.Username, DisplayName: row.DisplayName, Email: row.Email, Role: row.Role, Group: row.Group,
			Deleted: row.DeletedAt.Valid,
		}
	}
	return briefs, nil
}

// ListEnterpriseUserIds 给定用户中哪些是企业主账号
func ListEnterpriseUserIds(userIds []int) (map[int]bool, error) {
	result := make(map[int]bool)
	if len(userIds) == 0 {
		return result, nil
	}
	ids := make([]int, 0)
	if err := DB.Model(&Enterprise{}).Where("user_id IN ?", userIds).Pluck("user_id", &ids).Error; err != nil {
		return nil, err
	}
	for _, id := range ids {
		result[id] = true
	}
	return result, nil
}

// FindUserForPromoterBinding 按「用户名或数字 ID」找未注销用户；找不到返回 gorm.ErrRecordNotFound
func FindUserForPromoterBinding(input string) (*User, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, gorm.ErrRecordNotFound
	}
	query := DB.Select("id, username, display_name, role, status")
	if id, err := strconv.Atoi(input); err == nil && id > 0 {
		query = query.Where("id = ?", id)
	} else {
		query = query.Where("username = ?", input)
	}
	var user User
	if err := query.First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}
