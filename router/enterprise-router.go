package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerEnterpriseRoutes 注册企业模块路由（TokenFunc 二开）
func registerEnterpriseRoutes(apiRouter *gin.RouterGroup) {
	adminRoute := apiRouter.Group("/admin/enterprise")
	adminRoute.Use(middleware.AdminAuth())
	{
		adminRoute.GET("/enterprises", controller.AdminListEnterprises)
		adminRoute.POST("/enterprises", controller.AdminCreateEnterprise)
		adminRoute.GET("/enterprises/:id", controller.AdminGetEnterprise)
		adminRoute.PUT("/enterprises/:id", controller.AdminUpdateEnterprise)
		adminRoute.PUT("/enterprises/:id/credit", controller.AdminConfigureEnterpriseCredit)
		adminRoute.DELETE("/enterprises/:id/credit", controller.AdminSwitchEnterprisePrepaid)
		adminRoute.PUT("/enterprises/:id/status", controller.AdminSetEnterpriseStatus)
		adminRoute.POST("/enterprises/:id/topup", controller.AdminRegisterEnterpriseTopup)
		adminRoute.GET("/enterprises/:id/ledger", controller.AdminListEnterpriseLedger)
		adminRoute.GET("/enterprises/:id/credit-periods", controller.AdminListEnterpriseCreditPeriods)
		adminRoute.GET("/enterprises/:id/usage/summary", controller.AdminGetEnterpriseUsageSummary)
		adminRoute.GET("/enterprises/:id/usage/export", controller.AdminExportEnterpriseUsage)
		adminRoute.GET("/bills", controller.AdminListEnterpriseBills)
		adminRoute.GET("/bills/:id", controller.AdminGetEnterpriseBill)
		adminRoute.POST("/bills/:id/payments", controller.AdminRegisterBillPayment)
		adminRoute.POST("/bills/:id/void", controller.AdminVoidEnterpriseBill)
		adminRoute.POST("/credit-periods/:id/issue", controller.AdminIssueBillNow)
		adminRoute.GET("/settings/seller", controller.AdminGetSellerProfile)
		adminRoute.PUT("/settings/seller", controller.AdminUpdateSellerProfile)
	}

	// 当前用户的企业资料：非企业用户也可调用，返回 null
	apiRouter.GET("/enterprise/self", middleware.UserAuth(), controller.GetEnterpriseSelf)

	consoleRoute := apiRouter.Group("/enterprise")
	consoleRoute.Use(middleware.UserAuth(), middleware.EnterpriseOwnerAuth())
	{
		consoleRoute.GET("/overview", controller.GetEnterpriseOverview)
		consoleRoute.GET("/ledger", controller.ListEnterpriseLedgerSelf)
		consoleRoute.GET("/credit-periods", controller.ListEnterpriseCreditPeriodsSelf)
		consoleRoute.GET("/usage/summary", controller.GetEnterpriseUsageSummary)
		consoleRoute.GET("/usage/export", controller.ExportEnterpriseUsageSelf)
		consoleRoute.GET("/bills", controller.ListEnterpriseBillsSelf)
		consoleRoute.GET("/bills/:id", controller.GetEnterpriseBillSelf)

		consoleRoute.GET("/departments", controller.ListEnterpriseDepartments)
		consoleRoute.POST("/departments", controller.CreateEnterpriseDepartment)
		consoleRoute.PUT("/departments/:id", controller.UpdateEnterpriseDepartment)
		consoleRoute.DELETE("/departments/:id", controller.DeleteEnterpriseDepartment)

		consoleRoute.GET("/employees", controller.ListEnterpriseEmployees)
		consoleRoute.POST("/employees", controller.CreateEnterpriseEmployee)
		consoleRoute.POST("/employees/import", controller.ImportEnterpriseEmployees)
		consoleRoute.PUT("/employees/:id", controller.UpdateEnterpriseEmployee)
		consoleRoute.DELETE("/employees/:id", controller.DeleteEnterpriseEmployee)

		consoleRoute.GET("/projects", controller.ListEnterpriseProjects)
		consoleRoute.POST("/projects", controller.CreateEnterpriseProject)
		consoleRoute.PUT("/projects/:id", controller.UpdateEnterpriseProject)
		consoleRoute.DELETE("/projects/:id", controller.DeleteEnterpriseProject)

		consoleRoute.GET("/tokens", controller.ListEnterpriseTokens)
		consoleRoute.POST("/tokens", controller.CreateEnterpriseToken)
		consoleRoute.PUT("/tokens/:id/assignment", controller.UpdateEnterpriseTokenAssignment)
	}
}
