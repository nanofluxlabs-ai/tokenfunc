package middleware

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

const (
	ContextKeyEnterprise      = "enterprise"
	ContextKeyEnterpriseActor = "enterprise_actor"
)

// EnterpriseOnlineTopUpRejectedMessage 企业主账号在线充值被拦截时的提示，同时是前端 locale 的 key
const EnterpriseOnlineTopUpRejectedMessage = "Enterprise accounts cannot top up online. Please contact your account manager for an offline top-up."

// EnterpriseAuth 企业控制台鉴权：必须在 UserAuth 之后使用。放行企业主账号，以及绑定了登录账号、
// 角色不为 none 的在职成员；把企业与身份（角色 / 团队范围）写入上下文，范围由各 handler 经 actor.Scope() 施加。
func EnterpriseAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		enterprise, actor, err := model.GetEnterpriseAccess(c.GetInt("id"))
		if err != nil {
			status := http.StatusInternalServerError
			message := "failed to load enterprise"
			if errors.Is(err, model.ErrEnterpriseNoAccess) {
				status = http.StatusForbidden
				message = "enterprise access required"
			}
			c.AbortWithStatusJSON(status, gin.H{"success": false, "message": message})
			return
		}
		c.Set(ContextKeyEnterprise, enterprise)
		c.Set(ContextKeyEnterpriseActor, actor)
		c.Next()
	}
}

// RequireEnterpriseRole 要求当前身份不低于某个成员角色（企业主视为最高）；必须在 EnterpriseAuth 之后使用
func RequireEnterpriseRole(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := c.MustGet(ContextKeyEnterpriseActor).(*model.EnterpriseActor)
		if !ok || !actor.AtLeast(role) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "message": "insufficient enterprise role"})
			return
		}
		c.Next()
	}
}

// RequireEnterpriseOwner 仅企业主账号可用（例如任命企业管理员）
func RequireEnterpriseOwner() gin.HandlerFunc {
	return func(c *gin.Context) {
		actor, ok := c.MustGet(ContextKeyEnterpriseActor).(*model.EnterpriseActor)
		if !ok || !actor.IsOwner {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "message": "enterprise owner required"})
			return
		}
		c.Next()
	}
}

// RejectEnterpriseOwner 企业主账号不走在线充值 / 兑换码 / 订阅购买 / 邀请额度划转：必须在 UserAuth 之后使用。
// 预付与授信企业一视同仁（预付余额只能由管理员登记线下转账）；支付回调 / notify 路由不挂本中间件。
// 只拦企业主账号（enterprises.user_id）：绑定了登录账号的成员仍是普通钱包，不拦。
func RejectEnterpriseOwner() gin.HandlerFunc {
	return func(c *gin.Context) {
		info, err := model.GetEnterpriseBillingInfo(c.GetInt("id"))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to load enterprise"})
			return
		}
		if info != nil {
			common.ApiErrorStatus(c, http.StatusForbidden, common.NewMessage(EnterpriseOnlineTopUpRejectedMessage))
			c.Abort()
			return
		}
		c.Next()
	}
}
