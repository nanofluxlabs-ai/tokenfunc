package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

// 员工自查接口按模型排行最多返回的条数
const enterpriseEmployeeTopModelLimit = 5

// GetEnterpriseEmployeeMe 员工凭自己的 API key 查看本 key 的归属、额度与用量（TokenAuth，OpenAI error 格式）。
// 只暴露 key 级信息，不含企业余额 / 授信额度；主账号未分配的 key 与非企业 key 一律 403。
func GetEnterpriseEmployeeMe(c *gin.Context) {
	info, err := model.GetEnterpriseBillingInfo(c.GetInt("id"))
	if err != nil {
		writeBillingError(c, http.StatusInternalServerError, string(types.ErrorCodeQueryDataError), err.Error())
		return
	}
	if info == nil {
		writeBillingError(c, http.StatusForbidden, string(types.ErrorCodeAccessDenied), "this API key does not belong to an enterprise")
		return
	}
	// 与 relay 入口 enterpriseBillingGate、/v1/dashboard/billing/credit 一致：停用的企业不提供任何自查信息
	if info.Status != model.EnterpriseStatusActive {
		writeBillingError(c, http.StatusForbidden, string(types.ErrorCodeInsufficientUserQuota), "enterprise account is suspended")
		return
	}
	profile, err := model.GetEnterpriseTokenProfile(c.GetInt("token_id"))
	if errors.Is(err, model.ErrEnterpriseResourceNotFound) || (err == nil && profile.EnterpriseId != info.EnterpriseId) {
		writeBillingError(c, http.StatusForbidden, string(types.ErrorCodeAccessDenied), "this API key is not assigned to an employee")
		return
	}
	if err != nil {
		writeBillingError(c, http.StatusInternalServerError, string(types.ErrorCodeQueryDataError), err.Error())
		return
	}
	// 归档团队会停用其全部 key，这里兜底状态漂移（例如 key 被手工重新启用）
	if profile.TeamStatus != model.EnterpriseTeamStatusActive {
		writeBillingError(c, http.StatusForbidden, string(types.ErrorCodeAccessDenied), "the team owning this API key is archived")
		return
	}
	if profile.HasMember && profile.MemberStatus != model.EnterpriseMemberStatusActive {
		writeBillingError(c, http.StatusForbidden, string(types.ErrorCodeAccessDenied), "the member holding this API key is disabled")
		return
	}
	enterprise, err := model.GetEnterpriseById(info.EnterpriseId)
	if err != nil {
		writeBillingError(c, http.StatusInternalServerError, string(types.ErrorCodeQueryDataError), err.Error())
		return
	}

	today, monthStart := model.CurrentEnterpriseUsageDays()
	tokenId := profile.Token.Id
	todayUsage, err := model.SumTokenUsage(tokenId, today, today)
	if err != nil {
		writeBillingError(c, http.StatusInternalServerError, string(types.ErrorCodeQueryDataError), err.Error())
		return
	}
	monthUsage, err := model.SumTokenUsage(tokenId, monthStart, today)
	if err != nil {
		writeBillingError(c, http.StatusInternalServerError, string(types.ErrorCodeQueryDataError), err.Error())
		return
	}
	topModels, err := model.TopTokenModels(tokenId, monthStart, today, enterpriseEmployeeTopModelLimit)
	if err != nil {
		writeBillingError(c, http.StatusInternalServerError, string(types.ErrorCodeQueryDataError), err.Error())
		return
	}
	modelNames, _, err := listUserModelNames(c)
	if err != nil {
		writeBillingError(c, http.StatusInternalServerError, string(types.ErrorCodeQueryDataError), err.Error())
		return
	}

	var member gin.H
	if profile.HasMember {
		member = gin.H{"name": profile.MemberName, "employee_no": profile.MemberEmployeeNo}
	}
	c.JSON(http.StatusOK, gin.H{
		"object":     "enterprise_employee",
		"enterprise": gin.H{"name": enterprise.Name, "billing_mode": enterprise.BillingMode},
		// budget_state 由团队月度预算（M14）填充，合并前为 null
		"team":   gin.H{"name": profile.TeamName, "budget_state": nil},
		"member": member,
		"key": gin.H{
			"name":            profile.Token.Name,
			"unlimited_quota": profile.Token.UnlimitedQuota,
			"remain_quota":    profile.Token.RemainQuota,
			"used_quota":      profile.Token.UsedQuota,
			"expired_time":    profile.Token.ExpiredTime,
			// quota_policy 由 key 周期限额（M4）填充，合并前为 null
			"quota_policy": nil,
		},
		"usage":      gin.H{"today": todayUsage, "month": monthUsage},
		"top_models": topModels,
		"models":     modelNames,
	})
}
