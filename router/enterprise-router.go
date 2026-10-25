package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"

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
		adminRoute.GET("/bills/:id/export", controller.AdminExportEnterpriseBill)
		adminRoute.POST("/bills/:id/payments", controller.AdminRegisterBillPayment)
		adminRoute.POST("/bills/:id/void", controller.AdminVoidEnterpriseBill)
		adminRoute.POST("/credit-periods/:id/issue", controller.AdminIssueBillNow)
		adminRoute.GET("/reconcile/alerts", controller.AdminListReconcileAlerts)
		adminRoute.POST("/reconcile/alerts/:bill_id/ack", controller.AdminAckReconcileAlert)
		adminRoute.GET("/settings/seller", controller.AdminGetSellerProfile)
		adminRoute.PUT("/settings/seller", controller.AdminUpdateSellerProfile)
		adminRoute.GET("/quotes/config", controller.AdminGetQuoteConfig)
		adminRoute.PUT("/quotes/config", controller.AdminUpdateQuoteConfig)
		adminRoute.POST("/quotes/render", controller.AdminRenderQuote)
		adminRoute.GET("/leads", controller.AdminListEnterpriseTrialLeads)
		adminRoute.PUT("/leads/:id", controller.AdminUpdateEnterpriseTrialLead)
	}

	// 营销页匿名留资：严格限流 + 请求体大小限制，服务端再按 IP 做日配额
	apiRouter.POST("/enterprise/leads", middleware.CriticalRateLimit(), middleware.AnonymousRequestBodyLimit(), controller.CreateEnterpriseTrialLead)

	// 当前用户的企业资料与身份：非企业用户也可调用，返回 null
	apiRouter.GET("/enterprise/self", middleware.UserAuth(), controller.GetEnterpriseSelf)

	// 企业控制台：企业主账号与绑定了登录账号的成员；财务类只对企业主 / 企业管理员开放，组织与 key 的范围由 handler 按角色收窄
	consoleRoute := apiRouter.Group("/enterprise")
	consoleRoute.Use(middleware.UserAuth(), middleware.EnterpriseAuth())
	{
		consoleRoute.GET("/overview", controller.GetEnterpriseOverview)
		consoleRoute.GET("/usage/summary", controller.GetEnterpriseUsageSummary)
		consoleRoute.GET("/usage/export", controller.ExportEnterpriseUsageSelf)

		financeRoute := consoleRoute.Group("", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleEnterpriseAdmin))
		{
			financeRoute.GET("/ledger", controller.ListEnterpriseLedgerSelf)
			financeRoute.GET("/credit-periods", controller.ListEnterpriseCreditPeriodsSelf)
			financeRoute.GET("/bills", controller.ListEnterpriseBillsSelf)
			financeRoute.GET("/bills/:id", controller.GetEnterpriseBillSelf)
			financeRoute.GET("/bills/:id/export", controller.ExportEnterpriseBillSelf)
		}

		consoleRoute.GET("/teams", controller.ListEnterpriseTeams)
		teamAdminRoute := consoleRoute.Group("", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleEnterpriseAdmin))
		{
			teamAdminRoute.POST("/teams", controller.CreateEnterpriseTeam)
			teamAdminRoute.PUT("/teams/:id", controller.UpdateEnterpriseTeam)
			teamAdminRoute.POST("/teams/:id/archive", controller.ArchiveEnterpriseTeam)
			teamAdminRoute.DELETE("/teams/:id", controller.DeleteEnterpriseTeam)
		}

		consoleRoute.GET("/members", controller.ListEnterpriseMembers)
		memberAdminRoute := consoleRoute.Group("", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleTeamAdmin))
		{
			memberAdminRoute.POST("/members", controller.CreateEnterpriseMember)
			memberAdminRoute.POST("/members/import", controller.ImportEnterpriseMembers)
			memberAdminRoute.PUT("/members/:id", controller.UpdateEnterpriseMember)
			memberAdminRoute.DELETE("/members/:id", controller.DeleteEnterpriseMember)
			memberAdminRoute.POST("/members/:id/login", controller.SetEnterpriseMemberLogin)
			memberAdminRoute.DELETE("/members/:id/login", controller.RemoveEnterpriseMemberLogin)
			memberAdminRoute.PUT("/members/:id/role", controller.SetEnterpriseMemberRole)
		}

		consoleRoute.GET("/tokens", controller.ListEnterpriseTokens)
		consoleRoute.POST("/tokens", controller.CreateEnterpriseToken)
		consoleRoute.PUT("/tokens/:id/assignment", controller.UpdateEnterpriseTokenAssignment)
		consoleRoute.POST("/tokens/:id/key", controller.GetEnterpriseTokenKey)
	}
}
