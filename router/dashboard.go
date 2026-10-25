package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func SetDashboardRouter(router *gin.Engine) {
	apiRouter := router.Group("/")
	apiRouter.Use(middleware.RouteTag("old_api"))
	apiRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	apiRouter.Use(middleware.GlobalAPIRateLimit())
	apiRouter.Use(middleware.CORS())
	apiRouter.Use(middleware.TokenAuth())
	{
		apiRouter.GET("/dashboard/billing/subscription", controller.GetSubscription)
		apiRouter.GET("/v1/dashboard/billing/subscription", controller.GetSubscription)
		apiRouter.GET("/dashboard/billing/usage", controller.GetUsage)
		apiRouter.GET("/v1/dashboard/billing/usage", controller.GetUsage)
		// 授信企业额度查询（TokenFunc 二开），与上面两条共用 API key 鉴权
		apiRouter.GET("/dashboard/billing/credit", controller.GetCreditBilling)
		apiRouter.GET("/v1/dashboard/billing/credit", controller.GetCreditBilling)
		// 员工凭自己的 API key 自查归属 / 额度 / 用量（TokenFunc 二开），不走 /api 下的访问令牌作用域规则
		apiRouter.GET("/enterprise/employee/me", controller.GetEnterpriseEmployeeMe)
		apiRouter.GET("/v1/enterprise/employee/me", controller.GetEnterpriseEmployeeMe)
	}
}
