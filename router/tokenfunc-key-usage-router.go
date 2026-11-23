package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerKeyUsageRoutes 公开用量查询页的 key 鉴权接口（TokenFunc 二开）；额度用上游 /api/usage/token，这里只补分页日志
func registerKeyUsageRoutes(apiRouter *gin.RouterGroup) {
	// 翻页与筛选频繁，按 IP 限流（默认 10 次/分钟）而不是 20 分钟 20 次的关键限流
	keyUsageRoute := apiRouter.Group("/key-usage", middleware.CORS(), middleware.KeyUsageRateLimit(), middleware.TokenAuthReadOnly())
	keyUsageRoute.GET("/logs", controller.GetKeyUsageLogs)
}
