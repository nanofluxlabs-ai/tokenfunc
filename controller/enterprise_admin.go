package controller

import (
	"errors"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 创建企业的两种方式：新建主账号 / 把已有普通用户升级为企业
const (
	enterpriseCreateModeNewUser = "new_user"
	enterpriseCreateModeUpgrade = "upgrade"
	// enterpriseDefaultOwnerGroup 新建主账号未指定分组时的默认分组
	enterpriseDefaultOwnerGroup = "default"
)

type enterpriseProfileRequest struct {
	Name             string                         `json:"name"`
	ContactName      string                         `json:"contact_name"`
	ContactEmail     string                         `json:"contact_email"`
	ContactPhone     string                         `json:"contact_phone"`
	PaymentTermsDays int                            `json:"payment_terms_days"`
	BillingProfile   model.EnterpriseBillingProfile `json:"billing_profile"`
	Remark           string                         `json:"remark"`
	// MaxTokens 企业 key 总数上限；0 沿用站点每用户上限
	MaxTokens int `json:"max_tokens"`
	// Group 企业主账号分组，nil 表示不修改；仅资料更新接口使用
	Group *string `json:"group"`
}

type adminCreateEnterpriseRequest struct {
	Mode        string `json:"mode"`
	UserId      int    `json:"user_id"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
	// Email 新建主账号的登录邮箱，必填（升级已有用户不用）
	Email string `json:"email"`
	// Group 主账号分组：新建时空值为 default，升级时空值保留原分组
	Group      string                   `json:"group"`
	Enterprise enterpriseProfileRequest `json:"enterprise"`
}

// adminEnterpriseDetail 管理员企业详情：企业资料 + 主账号分组
type adminEnterpriseDetail struct {
	*model.Enterprise
	OwnerGroup string `json:"owner_group"`
}

// enterpriseGroupOption 企业主账号可选分组及其倍率
type enterpriseGroupOption struct {
	Group string  `json:"group"`
	Ratio float64 `json:"ratio"`
}

func (r enterpriseProfileRequest) toEnterprise() *model.Enterprise {
	return &model.Enterprise{
		Name:             r.Name,
		ContactName:      r.ContactName,
		ContactEmail:     r.ContactEmail,
		ContactPhone:     r.ContactPhone,
		PaymentTermsDays: r.PaymentTermsDays,
		BillingProfile:   r.BillingProfile,
		Remark:           r.Remark,
		MaxTokens:        r.MaxTokens,
	}
}

func AdminListEnterprises(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.ListEnterprises(c.Query("keyword"), c.Query("billing_mode"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetEnterprise(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid enterprise id")
		return
	}
	enterprise, err := model.GetEnterpriseById(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "enterprise not found"})
			return
		}
		common.ApiError(c, err)
		return
	}
	ownerGroup, err := model.GetUserGroup(enterprise.UserId, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, adminEnterpriseDetail{Enterprise: enterprise, OwnerGroup: ownerGroup})
}

// AdminListEnterpriseGroupOptions 企业主账号可选分组：分组倍率里已配置的全部分组，按名称升序
func AdminListEnterpriseGroupOptions(c *gin.Context) {
	ratios := ratio_setting.GetGroupRatioCopy()
	options := make([]enterpriseGroupOption, 0, len(ratios))
	for _, group := range slices.Sorted(maps.Keys(ratios)) {
		options = append(options, enterpriseGroupOption{Group: group, Ratio: ratios[group]})
	}
	common.ApiSuccess(c, options)
}

func AdminCreateEnterprise(c *gin.Context) {
	var req adminCreateEnterpriseRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	enterprise := req.Enterprise.toEnterprise()
	group := strings.TrimSpace(req.Group)

	switch req.Mode {
	case enterpriseCreateModeNewUser:
		if group == "" {
			group = enterpriseDefaultOwnerGroup
		}
		user := &model.User{
			Username:    strings.TrimSpace(req.Username),
			Password:    req.Password,
			DisplayName: strings.TrimSpace(req.DisplayName),
			Email:       model.NormalizeEmail(req.Email),
			Group:       group,
		}
		if user.Username == "" || user.Password == "" {
			common.ApiErrorMsg(c, "username and password are required")
			return
		}
		if user.DisplayName == "" {
			user.DisplayName = user.Username
		}
		if user.Email == "" {
			common.ApiErrorT(c, "Login email is required")
			return
		}
		if common.Validate.Var(user.Email, "email,max=50") != nil {
			common.ApiErrorT(c, "Invalid email address")
			return
		}
		if err := common.Validate.Struct(user); err != nil {
			common.ApiErrorMsg(c, "invalid user input: "+err.Error())
			return
		}
		if err := model.CreateEnterpriseWithNewUser(user, enterprise); err != nil {
			if errors.Is(err, model.ErrEmailAlreadyTaken) {
				common.ApiErrorT(c, "Email address is already in use")
				return
			}
			enterpriseApiError(c, err)
			return
		}
	case enterpriseCreateModeUpgrade:
		if req.UserId <= 0 {
			common.ApiErrorMsg(c, "user_id is required")
			return
		}
		if err := model.UpgradeUserToEnterprise(req.UserId, enterprise, group); err != nil {
			enterpriseApiError(c, err)
			return
		}
	default:
		common.ApiErrorMsg(c, "invalid create mode")
		return
	}

	recordManageAuditFor(c, enterprise.UserId, "enterprise.create", map[string]any{
		"enterprise_id":   enterprise.Id,
		"enterprise_name": enterprise.Name,
		"mode":            req.Mode,
		"group":           group,
	})
	// 与详情接口同形：升级时分组可能是「保留原分组」，前端需要拿到实际分组
	ownerGroup, _ := model.GetUserGroup(enterprise.UserId, true)
	common.ApiSuccess(c, adminEnterpriseDetail{Enterprise: enterprise, OwnerGroup: ownerGroup})
}

func AdminUpdateEnterprise(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "invalid enterprise id")
		return
	}
	var req enterpriseProfileRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	existing, err := model.GetEnterpriseById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// 先校验分组再写资料，避免资料已更新而分组被拒的半成功
	group := ""
	if req.Group != nil {
		if group, err = model.NormalizeEnterpriseOwnerGroup(*req.Group); err != nil {
			enterpriseApiError(c, err)
			return
		}
	}
	enterprise := req.toEnterprise()
	enterprise.Id = existing.Id
	// 计费模式与状态不在资料接口里修改，沿用原值以通过校验
	enterprise.BillingMode = existing.BillingMode
	enterprise.Status = existing.Status
	if err := model.UpdateEnterpriseProfile(enterprise); err != nil {
		common.ApiError(c, err)
		return
	}
	auditParams := map[string]any{
		"enterprise_id":   existing.Id,
		"enterprise_name": enterprise.Name,
		"max_tokens":      enterprise.MaxTokens,
	}
	if req.Group != nil {
		// 分组变化时 model 层已递增 auth_version、刷新缓存并吊销主账号全部会话
		oldGroup, changed, err := model.UpdateEnterpriseOwnerGroup(existing.Id, group)
		if err != nil {
			enterpriseApiError(c, err)
			return
		}
		if changed {
			auditParams["group_from"], auditParams["group_to"] = oldGroup, group
		}
	}
	recordManageAuditFor(c, existing.UserId, "enterprise.update", auditParams)
	common.ApiSuccess(c, nil)
}

// rejectEnterpriseAffiliatedUser 系统管理员不得删除 / 禁用 / 提权企业账号（主账号与在职成员的登录账号）：
// 企业员工由企业自治，主账号被删会让企业变孤儿。命中时已写响应并返回 true，调用方直接 return
func rejectEnterpriseAffiliatedUser(c *gin.Context, userId int) bool {
	affiliation, err := model.GetUserEnterpriseAffiliation(userId)
	if err != nil {
		common.ApiError(c, err)
		return true
	}
	if affiliation == nil {
		return false
	}
	common.ApiErrorT(c, "This account belongs to an enterprise, manage it from the enterprise module")
	return true
}

// AdminListEnterpriseMembers 系统管理员只读查看某企业的成员（范围为全企业，不受团队限制）
func AdminListEnterpriseMembers(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	enterprise, err := model.GetEnterpriseById(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "enterprise not found"})
			return
		}
		common.ApiError(c, err)
		return
	}
	pageInfo := common.GetPageQuery(c)
	filter := model.EnterpriseMemberFilter{
		TeamId:   optionalIntQuery(c, "team_id"),
		Keyword:  c.Query("keyword"),
		Status:   c.Query("status"),
		HasLogin: optionalBoolQuery(c, "has_login"),
	}
	items, total, err := model.ListEnterpriseMembers(enterprise.Id, model.EnterpriseScope{}, filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}
