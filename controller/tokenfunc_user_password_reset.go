package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// AdminResetUserPassword POST /api/user/:id/reset_password（TokenFunc 二开）
// 管理员为个人用户 / 企业主随机重置密码：权限与二次验证同重置 Passkey，
// 新密码只在响应里出现一次；踢掉全部会话，记审计，尽力给用户发安全通知。
func AdminResetUserPassword(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorT(c, "Invalid user ID")
		return
	}

	user := &model.User{Id: id}
	if err := user.FillUserById(); err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	if !canManageTargetRole(c.GetInt("role"), user.Role) {
		common.ApiErrorMsg(c, "no permission")
		return
	}
	authorization := requireAdminUserProof(c, service.VerificationScopeAdminUserPasswordReset, service.AdminUserContext{UserID: user.Id})
	if authorization == nil {
		return
	}

	result, err := model.ResetUserPasswordRandom(user.Id)
	if err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	if _, err := model.RevokeAllUserSessions(user.Id, "admin_password_reset"); err != nil {
		writeSecurityOperationError(c, err)
		return
	}

	recordManageAuditFor(c, user.Id, "user.reset_password", map[string]any{
		"username":            user.Username,
		"id":                  user.Id,
		"verification_method": authorization.Method,
	})
	// 尽力通知用户本人（邮箱缺失或发送失败不阻塞重置）
	if user.Email != "" {
		if notifyErr := service.NotifyAccountSecurityChange(service.AccountMailLanguage(c, user.Id), user.Email, i18n.MsgSecurityEventPasswordUpdated); notifyErr != nil {
			common.SysError(common.LogText("failed to notify user of admin password reset: %s", notifyErr.Error()))
		}
	}
	common.ApiSuccess(c, result)
}
