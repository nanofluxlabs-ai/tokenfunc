package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerFinanceRoutes 注册财务中心路由（TokenFunc 二开，只读报表，管理员）
func registerFinanceRoutes(apiRouter *gin.RouterGroup) {
	financeRoute := apiRouter.Group("/admin/finance")
	financeRoute.Use(middleware.AdminAuth())
	{
		financeRoute.GET("/overview", controller.AdminGetFinanceOverview)
		financeRoute.GET("/orders", controller.AdminListFinanceOrders)
		financeRoute.GET("/user-consumptions", controller.AdminListFinanceUserConsumptions)
		financeRoute.GET("/model-consumptions", controller.AdminListFinanceModelConsumptions)
		financeRoute.GET("/usage/summary", controller.AdminGetFinanceUsageSummary)
		financeRoute.GET("/usage/daily", controller.AdminGetFinanceUsageDaily)
		financeRoute.GET("/usage/detail", controller.AdminListFinanceUsageDetail)
		financeRoute.GET("/usage/export", controller.AdminExportFinanceUsage)
		financeRoute.GET("/bills", controller.AdminListFinanceBills)
		financeRoute.GET("/bills/:kind/:id", controller.AdminGetFinanceBill)
	}
}
