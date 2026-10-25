package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerPromoterRoutes 注册推广人模块路由（TokenFunc 二开）
func registerPromoterRoutes(apiRouter *gin.RouterGroup) {
	// 当前用户的推广人档案：非推广人也可调用，返回 null
	apiRouter.GET("/promoter/self", middleware.UserAuth(), controller.GetPromoterSelf)

	// 推广中心自助视图
	centerRoute := apiRouter.Group("/promoter/center")
	centerRoute.Use(middleware.UserAuth(), middleware.PromoterAuth())
	{
		centerRoute.GET("/overview", controller.GetPromoterCenterOverview)
		centerRoute.GET("/users", controller.ListPromoterCenterUsers)
		centerRoute.GET("/models", controller.ListPromoterCenterModels)
		centerRoute.GET("/users/:user_id/usage", controller.GetPromoterCenterUserUsage)
	}

	adminRoute := apiRouter.Group("/admin/promoter")
	adminRoute.Use(middleware.AdminAuth())
	{
		adminRoute.GET("/promoters", controller.AdminListPromoters)
		adminRoute.POST("/promoters", controller.AdminCreatePromoter)
		oneRoute := adminRoute.Group("/promoters/:id")
		oneRoute.Use(middleware.PromoterFromParam())
		{
			oneRoute.PUT("", controller.AdminUpdatePromoter)
			oneRoute.DELETE("", controller.AdminRemovePromoter)
			oneRoute.GET("/bindings", controller.ListPromoterCenterUsers)
			oneRoute.POST("/bindings", controller.AdminBindPromoterUsers)
			oneRoute.DELETE("/bindings/:user_id", controller.AdminUnbindPromoterUser)
			oneRoute.GET("/center/overview", controller.GetPromoterCenterOverview)
			oneRoute.GET("/center/users", controller.ListPromoterCenterUsers)
			oneRoute.GET("/center/models", controller.ListPromoterCenterModels)
			oneRoute.GET("/center/users/:user_id/usage", controller.GetPromoterCenterUserUsage)
		}
	}
}
