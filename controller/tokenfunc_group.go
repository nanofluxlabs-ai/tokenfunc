package controller

// TokenFunc 二开：用户分组 / 渠道分组注册表与用户分组定价接口。
// 管理员：用户管理 › 用户分组 Tab、各处分组下拉；登录用户：令牌分组下拉（按后台排序）。

import (
	"errors"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

// channelGroupItem 管理员视角的渠道分组：注册表信息 + 基准倍率 + 充值倍率 + 默认可见
type channelGroupItem struct {
	Key            string  `json:"key"`
	Label          string  `json:"label"`
	Order          int     `json:"order"`
	Ratio          float64 `json:"ratio"`
	TopupRatio     float64 `json:"topup_ratio"`
	DefaultVisible bool    `json:"default_visible"`
}

// ListTokenFuncChannelGroups 全部渠道分组，按后台排序
func ListTokenFuncChannelGroups(c *gin.Context) {
	defaults := setting.GetUserUsableGroupsCopy()
	// 充值倍率没配的分组按 1 展示；不用 GetTopupGroupRatio，它会对缺失项打错误日志
	topupRatios := map[string]float64{}
	_ = common.UnmarshalJsonStr(common.TopupGroupRatio2JSONString(), &topupRatios)
	entries := setting.ListChannelGroups()
	items := make([]channelGroupItem, 0, len(entries))
	for _, entry := range entries {
		_, defaultVisible := defaults[entry.Key]
		topupRatio, hasTopup := topupRatios[entry.Key]
		if !hasTopup {
			topupRatio = 1
		}
		items = append(items, channelGroupItem{
			Key:            entry.Key,
			Label:          entry.Label,
			Order:          entry.Order,
			Ratio:          entry.Ratio,
			TopupRatio:     topupRatio,
			DefaultVisible: defaultVisible,
		})
	}
	common.ApiSuccess(c, items)
}

// userGroupItem 管理员视角的用户分组：注册表信息 + 用户数 + 与基准不同的格数
type userGroupItem struct {
	setting.UserGroupEntry
	UserCount     int64 `json:"user_count"`
	OverrideCount int   `json:"override_count"`
}

// ListTokenFuncUserGroups 全部用户分组，按后台排序
func ListTokenFuncUserGroups(c *gin.Context) {
	counts, err := model.CountUsersByGroup()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	entries := setting.ListUserGroups()
	items := make([]userGroupItem, 0, len(entries))
	for _, entry := range entries {
		items = append(items, userGroupItem{
			UserGroupEntry: entry,
			UserCount:      counts[entry.Key],
			OverrideCount:  service.UserGroupOverrideCount(entry.Key),
		})
	}
	common.ApiSuccess(c, items)
}

type userGroupRequest struct {
	Key string `json:"key"`
	setting.UserGroupMeta
}

// CreateTokenFuncUserGroup 新增用户分组
func CreateTokenFuncUserGroup(c *gin.Context) {
	var req userGroupRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := service.CreateUserGroup(req.Key, req.UserGroupMeta); err != nil {
		respondUserGroupError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// UpdateTokenFuncUserGroup 修改用户分组的名称 / 说明 / 类型
func UpdateTokenFuncUserGroup(c *gin.Context) {
	var req userGroupRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := service.UpdateUserGroup(c.Param("key"), req.UserGroupMeta); err != nil {
		respondUserGroupError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// DeleteTokenFuncUserGroup 删除用户分组（default 与仍有用户的分组拒删）
func DeleteTokenFuncUserGroup(c *gin.Context) {
	if err := service.DeleteUserGroup(c.Param("key")); err != nil {
		respondUserGroupError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ReorderTokenFuncUserGroups 按给定 key 顺序重排用户分组
func ReorderTokenFuncUserGroups(c *gin.Context) {
	var req struct {
		Keys []string `json:"keys"`
	}
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := service.ReorderUserGroups(req.Keys); err != nil {
		respondUserGroupError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// GetTokenFuncUserGroupPricing 某用户分组的渠道分组定价表
func GetTokenFuncUserGroupPricing(c *gin.Context) {
	key := c.Param("key")
	if !setting.IsRegisteredUserGroup(key) {
		respondUserGroupError(c, setting.ErrUserGroupNotFound)
		return
	}
	common.ApiSuccess(c, service.GetUserGroupPricing(key))
}

// SaveTokenFuncUserGroupPricing 保存某用户分组的渠道分组定价表
func SaveTokenFuncUserGroupPricing(c *gin.Context) {
	var req struct {
		Rows []service.UserGroupPricingInput `json:"rows"`
	}
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := service.SaveUserGroupPricing(c.Param("key"), req.Rows); err != nil {
		respondUserGroupError(c, err)
		return
	}
	common.ApiSuccess(c, service.GetUserGroupPricing(c.Param("key")))
}

// SaveTokenFuncGroupSettings 系统设置 › 分组定价 的统一保存：分组 option 与某用户分组的定价表一个事务落库
func SaveTokenFuncGroupSettings(c *gin.Context) {
	var req struct {
		Options     map[string]string             `json:"options"`
		UserPricing *service.UserGroupPricingSave `json:"user_pricing"`
	}
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := service.SaveGroupSettings(req.Options, req.UserPricing); err != nil {
		respondUserGroupError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// selfChannelGroupItem 登录用户可选的渠道分组；auto 不带倍率
type selfChannelGroupItem struct {
	Key   string   `json:"key"`
	Label string   `json:"label"`
	Ratio *float64 `json:"ratio"`
	Order int      `json:"order"`
	Auto  bool     `json:"auto"`
}

// ListTokenFuncSelfChannelGroups 当前用户可选的渠道分组，按后台排序；可用时附带 auto
func ListTokenFuncSelfChannelGroups(c *gin.Context) {
	userGroup, err := model.GetUserGroup(c.GetInt("id"), false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	options := service.ListUserSelectableChannelGroups(userGroup)
	items := make([]selfChannelGroupItem, 0, len(options)+1)
	for _, option := range options {
		ratio := option.Ratio
		items = append(items, selfChannelGroupItem{Key: option.Key, Label: option.Label, Ratio: &ratio, Order: option.Order})
	}
	if _, ok := service.GetUserUsableGroups(userGroup)["auto"]; ok {
		items = append(items, selfChannelGroupItem{Key: "auto", Label: setting.GetUsableGroupDescription("auto"), Auto: true})
	}
	common.ApiSuccess(c, gin.H{
		"user_group":    userGroup,
		"default_group": service.ResolveDefaultUsingGroup(userGroup),
		"groups":        items,
	})
}

func respondUserGroupError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, setting.ErrUserGroupNotFound):
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "user group not found"})
	case errors.Is(err, setting.ErrUserGroupExists),
		errors.Is(err, setting.ErrUserGroupDefault),
		errors.Is(err, setting.ErrUserGroupInvalidKey),
		errors.Is(err, setting.ErrUserGroupInvalidKind),
		errors.Is(err, service.ErrUserGroupInUse),
		errors.Is(err, service.ErrChannelGroupUnknown),
		errors.Is(err, service.ErrChannelGroupRatioFormat),
		errors.Is(err, service.ErrGroupSettingKeyNotAllowed),
		errors.Is(err, service.ErrGroupSettingInvalid):
		common.ApiErrorMsg(c, strings.TrimSpace(err.Error()))
	default:
		common.ApiError(c, err)
	}
}
