package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerLogStatRoutes 注册使用日志页统计徽标路由（TokenFunc 二开），替代前端对上游 /log/stat 的调用
func registerLogStatRoutes(apiRouter *gin.RouterGroup) {
	route := apiRouter.Group("/log")
	route.GET("/summary", middleware.AdminAuth(), controller.GetLogsSummary)
	route.GET("/self/summary", middleware.UserAuth(), controller.GetLogsSelfSummary)
}
