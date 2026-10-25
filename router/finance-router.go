package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerFinanceRoutes 注册财务路由（TokenFunc 二开，只读报表）：
//   - /api/admin/finance 管理员财务中心
//   - /api/user/finance  个人财务对账（本人消费账单 + 钱包流水）
func registerFinanceRoutes(apiRouter *gin.RouterGroup) {
	selfRoute := apiRouter.Group("/user/finance")
	selfRoute.Use(middleware.DisableCache(), middleware.UserAuth())
	{
		selfRoute.GET("/usage/summary", controller.GetSelfFinanceUsageSummary)
		selfRoute.GET("/usage/daily", controller.GetSelfFinanceUsageDaily)
		selfRoute.GET("/usage/detail", controller.GetSelfFinanceUsageDetail)
		selfRoute.GET("/usage/export", controller.GetSelfFinanceUsageExport)
		selfRoute.GET("/topup/summary", controller.GetSelfFinanceTopupSummary)
		selfRoute.GET("/topup/detail", controller.GetSelfFinanceTopupDetail)
		selfRoute.GET("/topup/export", controller.GetSelfFinanceTopupExport)
	}

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
		financeRoute.POST("/bill-archives/:id", controller.AdminArchiveFinanceBill)
		financeRoute.GET("/bill-archives/:id/:file", controller.AdminDownloadFinanceBillArchive)
	}
}
