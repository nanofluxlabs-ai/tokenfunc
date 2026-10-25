package middleware

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const ContextKeyEnterprise = "enterprise"

// EnterpriseOnlineTopUpRejectedMessage 企业主账号在线充值被拦截时的提示，同时是前端 locale 的 key
const EnterpriseOnlineTopUpRejectedMessage = "Enterprise accounts cannot top up online. Please contact your account manager for an offline top-up."

// EnterpriseOwnerAuth 企业控制台鉴权：必须在 UserAuth 之后使用，当前登录用户必须是企业主账号
func EnterpriseOwnerAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		enterprise, err := model.GetEnterpriseByUserId(c.GetInt("id"))
		if err != nil {
			status := http.StatusInternalServerError
			message := "failed to load enterprise"
			if errors.Is(err, gorm.ErrRecordNotFound) {
				status = http.StatusForbidden
				message = "enterprise account required"
			}
			c.AbortWithStatusJSON(status, gin.H{"success": false, "message": message})
			return
		}
		c.Set(ContextKeyEnterprise, enterprise)
		c.Next()
	}
}

// RejectEnterpriseOwner 企业主账号不走在线充值 / 兑换码 / 订阅购买 / 邀请额度划转：必须在 UserAuth 之后使用。
// 预付与授信企业一视同仁（预付余额只能由管理员登记线下转账）；支付回调 / notify 路由不挂本中间件。
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
