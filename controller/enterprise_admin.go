package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 创建企业的两种方式：新建主账号 / 把已有普通用户升级为企业
const (
	enterpriseCreateModeNewUser = "new_user"
	enterpriseCreateModeUpgrade = "upgrade"
)

type enterpriseProfileRequest struct {
	Name             string                         `json:"name"`
	ContactName      string                         `json:"contact_name"`
	ContactEmail     string                         `json:"contact_email"`
	ContactPhone     string                         `json:"contact_phone"`
	PaymentTermsDays int                            `json:"payment_terms_days"`
	BillingProfile   model.EnterpriseBillingProfile `json:"billing_profile"`
	Remark           string                         `json:"remark"`
}

type adminCreateEnterpriseRequest struct {
	Mode        string                   `json:"mode"`
	UserId      int                      `json:"user_id"`
	Username    string                   `json:"username"`
	Password    string                   `json:"password"`
	DisplayName string                   `json:"display_name"`
	Enterprise  enterpriseProfileRequest `json:"enterprise"`
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
	common.ApiSuccess(c, enterprise)
}

func AdminCreateEnterprise(c *gin.Context) {
	var req adminCreateEnterpriseRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	enterprise := req.Enterprise.toEnterprise()

	switch req.Mode {
	case enterpriseCreateModeNewUser:
		user := &model.User{
			Username:    strings.TrimSpace(req.Username),
			Password:    req.Password,
			DisplayName: strings.TrimSpace(req.DisplayName),
		}
		if user.Username == "" || user.Password == "" {
			common.ApiErrorMsg(c, "username and password are required")
			return
		}
		if user.DisplayName == "" {
			user.DisplayName = user.Username
		}
		if err := common.Validate.Struct(user); err != nil {
			common.ApiErrorMsg(c, "invalid user input: "+err.Error())
			return
		}
		if err := model.CreateEnterpriseWithNewUser(user, enterprise); err != nil {
			common.ApiError(c, err)
			return
		}
	case enterpriseCreateModeUpgrade:
		if req.UserId <= 0 {
			common.ApiErrorMsg(c, "user_id is required")
			return
		}
		if err := model.UpgradeUserToEnterprise(req.UserId, enterprise); err != nil {
			common.ApiError(c, err)
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
	})
	common.ApiSuccess(c, enterprise)
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
	enterprise := req.toEnterprise()
	enterprise.Id = existing.Id
	// 计费模式与状态不在资料接口里修改，沿用原值以通过校验
	enterprise.BillingMode = existing.BillingMode
	enterprise.Status = existing.Status
	if err := model.UpdateEnterpriseProfile(enterprise); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, existing.UserId, "enterprise.update", map[string]any{
		"enterprise_id":   existing.Id,
		"enterprise_name": enterprise.Name,
	})
	common.ApiSuccess(c, nil)
}
