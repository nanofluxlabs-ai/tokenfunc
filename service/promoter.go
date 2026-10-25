package service

import (
	"errors"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"gorm.io/gorm"
)

// 推广人命令层（TokenFunc 二开）：设 / 撤推广人、绑定 / 解绑用户。
// 业务错误统一用 common.NewMessage(key) 返回，controller 用 ApiError 下发后前端按 key 翻译。

// PromoterBatchBindMax 单次批量绑定上限
const PromoterBatchBindMax = 200

var (
	errPromoterUserMissing   = "User does not exist or has been deleted"
	errPromoterAdmin         = "Admin accounts cannot be promoters"
	errPromoterExists        = "This user is already a promoter"
	errPromoterBindSelf      = "A promoter cannot bind themselves"
	errPromoterBindAdmin     = "Admin accounts cannot be bound"
	errPromoterBindOther     = "Already bound to promoter {{promoter}}, unbind there first"
	errPromoterBindSame      = "Already bound to this promoter"
	errPromoterBindingNotFnd = "Binding not found"
	errPromoterBatchTooLarge = "At most {{max}} users per batch"
	errPromoterShareRate     = "Share rate must be between 0 and 100"
	errPromoterNotFound      = "Promoter not found"
)

// normalizePromoterShareRate 分成比例校验：0～100，保留两位小数
func normalizePromoterShareRate(rate float64) (float64, error) {
	if rate < 0 || rate > 100 {
		return 0, common.NewMessage(errPromoterShareRate)
	}
	return math.Round(rate*100) / 100, nil
}

// SetPromoter 把普通用户设为推广人
func SetPromoter(operatorId int, userId int, remark string, shareRate float64) (*model.Promoter, error) {
	shareRate, err := normalizePromoterShareRate(shareRate)
	if err != nil {
		return nil, err
	}
	user, err := model.GetUserById(userId, false)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, common.NewMessage(errPromoterUserMissing)
		}
		return nil, err
	}
	if user.Role >= common.RoleAdminUser {
		return nil, common.NewMessage(errPromoterAdmin)
	}
	if _, err := model.GetActivePromoterByUserId(userId); err == nil {
		return nil, common.NewMessage(errPromoterExists)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	now := common.GetTimestamp()
	promoter := &model.Promoter{UserId: userId, Remark: strings.TrimSpace(remark), ShareRate: shareRate, CreatedBy: operatorId, CreatedAt: now, UpdatedAt: now}
	if err := model.CreatePromoter(promoter); err != nil {
		// 并发下撞部分唯一索引：再查一次给出稳定的业务错误
		if _, again := model.GetActivePromoterByUserId(userId); again == nil {
			return nil, common.NewMessage(errPromoterExists)
		}
		return nil, err
	}
	return promoter, nil
}

// UpdatePromoter 修改备注与分成比例；成功后 promoter 就地更新
func UpdatePromoter(promoter *model.Promoter, remark string, shareRate float64) error {
	shareRate, err := normalizePromoterShareRate(shareRate)
	if err != nil {
		return err
	}
	remark = strings.TrimSpace(remark)
	now := common.GetTimestamp()
	if err := model.UpdatePromoter(promoter.Id, remark, shareRate, now); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return common.NewMessage(errPromoterNotFound)
		}
		return err
	}
	promoter.Remark, promoter.ShareRate, promoter.UpdatedAt = remark, shareRate, now
	return nil
}

// UnsetPromoter 移除推广人身份并解绑名下全部用户，返回解绑数
func UnsetPromoter(operatorId int, promoter *model.Promoter) (int64, error) {
	unbound, err := model.RemovePromoterWithBindings(promoter, operatorId, common.GetTimestamp())
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, common.NewMessage(errPromoterNotFound)
	}
	return unbound, err
}

// PromoterBindFailure 批量绑定里单条失败的原因（key + params 由前端翻译）
type PromoterBindFailure struct {
	Input        string         `json:"input"`
	ReasonKey    string         `json:"reason_key"`
	ReasonParams map[string]any `json:"reason_params,omitempty"`
}

// PromoterBindResult 批量绑定结果
type PromoterBindResult struct {
	Bound  []*model.PromoterUserBrief `json:"bound"`
	Failed []PromoterBindFailure      `json:"failed"`
}

// BindUsers 把若干用户（用户名或数字 ID）绑到推广人名下，逐条校验、逐条落库，返回成功与失败明细。
// includeHistory 为 true 时 usage_since=0（全历史），否则从现在所在的上海日起算。
func BindUsers(operatorId int, promoterUserId int, inputs []string, includeHistory bool) (*PromoterBindResult, error) {
	if len(inputs) > PromoterBatchBindMax {
		return nil, common.NewMessage(errPromoterBatchTooLarge, map[string]any{"max": PromoterBatchBindMax})
	}
	result := &PromoterBindResult{Bound: make([]*model.PromoterUserBrief, 0), Failed: make([]PromoterBindFailure, 0)}
	now := common.GetTimestamp()
	usageSince := now
	if includeHistory {
		usageSince = 0
	}
	seen := make(map[int]bool, len(inputs))
	for _, raw := range inputs {
		input := strings.TrimSpace(raw)
		if input == "" {
			continue
		}
		user, err := model.FindUserForPromoterBinding(input)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				result.Failed = append(result.Failed, PromoterBindFailure{Input: input, ReasonKey: errPromoterUserMissing})
				continue
			}
			return nil, err
		}
		if seen[user.Id] {
			continue
		}
		seen[user.Id] = true
		if reason := checkPromoterBindTarget(promoterUserId, user); reason != nil {
			result.Failed = append(result.Failed, PromoterBindFailure{Input: input, ReasonKey: reason.Key, ReasonParams: reason.Params})
			continue
		}
		binding := &model.PromoterBinding{
			PromoterUserId: promoterUserId, UserId: user.Id, Source: model.PromoterBindingSourceAdmin,
			BoundBy: operatorId, BoundAt: now, UsageSince: usageSince,
		}
		if err := model.CreatePromoterBinding(binding); err != nil {
			// 并发下撞活跃绑定唯一索引：按「已归属」处理
			if reason := checkPromoterBindTarget(promoterUserId, user); reason != nil {
				result.Failed = append(result.Failed, PromoterBindFailure{Input: input, ReasonKey: reason.Key, ReasonParams: reason.Params})
				continue
			}
			return nil, err
		}
		result.Bound = append(result.Bound, &model.PromoterUserBrief{Id: user.Id, Username: user.Username, DisplayName: user.DisplayName, Role: user.Role})
	}
	return result, nil
}

// checkPromoterBindTarget 绑定规则：不能绑自己、不能绑管理员、不能绑已有归属的用户
func checkPromoterBindTarget(promoterUserId int, user *model.User) *common.Message {
	if user.Id == promoterUserId {
		return common.NewMessage(errPromoterBindSelf)
	}
	if user.Role >= common.RoleAdminUser {
		return common.NewMessage(errPromoterBindAdmin)
	}
	existing, err := model.GetActiveBindingByUserId(user.Id)
	if err != nil {
		return nil
	}
	if existing.PromoterUserId == promoterUserId {
		return common.NewMessage(errPromoterBindSame)
	}
	promoterName, _ := model.GetUsernameById(existing.PromoterUserId, true)
	if promoterName == "" {
		promoterName = "#" + common.Interface2String(existing.PromoterUserId)
	}
	return common.NewMessage(errPromoterBindOther, map[string]any{"promoter": promoterName})
}

// UnbindUser 解除某用户与推广人的绑定
func UnbindUser(operatorId int, promoterUserId int, userId int) error {
	err := model.UnbindPromoterBinding(promoterUserId, userId, operatorId, common.GetTimestamp())
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return common.NewMessage(errPromoterBindingNotFnd)
	}
	return err
}
