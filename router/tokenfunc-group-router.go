package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerTokenFuncGroupRoutes 用户分组 / 渠道分组注册表与用户分组定价（TokenFunc 二开）
func registerTokenFuncGroupRoutes(apiRouter *gin.RouterGroup) {
	adminRoute := apiRouter.Group("/tokenfunc/groups")
	adminRoute.Use(middleware.AdminAuth())
	{
		adminRoute.GET("/channel", controller.ListTokenFuncChannelGroups)
		adminRoute.GET("/user", controller.ListTokenFuncUserGroups)
		adminRoute.POST("/user", controller.CreateTokenFuncUserGroup)
		adminRoute.PUT("/user-order", controller.ReorderTokenFuncUserGroups)
		adminRoute.PUT("/user/:key", controller.UpdateTokenFuncUserGroup)
		adminRoute.DELETE("/user/:key", controller.DeleteTokenFuncUserGroup)
		adminRoute.GET("/user/:key/pricing", controller.GetTokenFuncUserGroupPricing)
		adminRoute.PUT("/user/:key/pricing", controller.SaveTokenFuncUserGroupPricing)
	}
	selfRoute := apiRouter.Group("/tokenfunc/groups")
	selfRoute.Use(middleware.UserAuth())
	{
		selfRoute.GET("/self", controller.ListTokenFuncSelfChannelGroups)
	}
}
