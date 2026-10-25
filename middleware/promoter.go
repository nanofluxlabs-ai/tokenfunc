package middleware

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ContextKeyPromoter 推广中心 handler 从上下文取 *model.Promoter 的键；自助与管理员两条路由共用同一组 handler
const ContextKeyPromoter = "promoter"

// PromoterAuth 推广中心自助鉴权：必须在 UserAuth 之后使用，当前登录用户必须是活跃推广人
func PromoterAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		promoter, err := model.GetActivePromoterByUserId(c.GetInt("id"))
		if err != nil {
			status, message := http.StatusInternalServerError, "failed to load promoter"
			if errors.Is(err, gorm.ErrRecordNotFound) {
				status, message = http.StatusForbidden, "promoter account required"
			}
			c.AbortWithStatusJSON(status, gin.H{"success": false, "message": message})
			return
		}
		c.Set(ContextKeyPromoter, promoter)
		c.Next()
	}
}

// PromoterFromParam 管理端：把路径参数 :id（tf_promoters.id）解析成活跃推广人放进上下文，不存在返回 404
func PromoterFromParam() gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil || id <= 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid promoter id"})
			return
		}
		promoter, err := model.GetActivePromoterById(id)
		if err != nil {
			status, message := http.StatusInternalServerError, "failed to load promoter"
			if errors.Is(err, gorm.ErrRecordNotFound) {
				status, message = http.StatusNotFound, "promoter not found"
			}
			c.AbortWithStatusJSON(status, gin.H{"success": false, "message": message})
			return
		}
		c.Set(ContextKeyPromoter, promoter)
		c.Next()
	}
}
