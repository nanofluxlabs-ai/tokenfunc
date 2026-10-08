package middleware

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const ContextKeyEnterprise = "enterprise"

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
