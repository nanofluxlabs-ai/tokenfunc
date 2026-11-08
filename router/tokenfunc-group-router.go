package router

import (
	"net/http"

	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service/authz"

	"github.com/gin-gonic/gin"
)

// registerTokenFuncGroupRoutes 用户分组 / 渠道分组注册表与用户分组定价（TokenFunc 二开）。
// 管理员接口按 group_pricing 权限逐项控制；会改计费的（定价、删除用户分组）需要 price。
func registerTokenFuncGroupRoutes(apiRouter *gin.RouterGroup) {
	adminRoute := apiRouter.Group("/tokenfunc/groups", middleware.AdminAuth())
	for _, route := range []permissionRoute{
		{method: http.MethodGet, path: "/channel", permission: authz.GroupPricingRead, handler: controller.ListTokenFuncChannelGroups},
		{method: http.MethodGet, path: "/user", permission: authz.GroupPricingRead, handler: controller.ListTokenFuncUserGroups},
		{method: http.MethodGet, path: "/user/:key/pricing", permission: authz.GroupPricingRead, handler: controller.GetTokenFuncUserGroupPricing},
		{method: http.MethodPost, path: "/user", permission: authz.GroupPricingManage, handler: controller.CreateTokenFuncUserGroup},
		{method: http.MethodPut, path: "/user-order", permission: authz.GroupPricingManage, handler: controller.ReorderTokenFuncUserGroups},
		{method: http.MethodPut, path: "/user/:key", permission: authz.GroupPricingManage, handler: controller.UpdateTokenFuncUserGroup},
		{method: http.MethodDelete, path: "/user/:key", permission: authz.GroupPricingPrice, handler: controller.DeleteTokenFuncUserGroup},
		{method: http.MethodPut, path: "/user/:key/pricing", permission: authz.GroupPricingPrice, handler: controller.SaveTokenFuncUserGroupPricing},
	} {
		handlePermissionRoute(adminRoute, route.method, route.path, route.permission, route.handler)
	}
	// 统一保存还会写 GroupRatio 等全局 option，与 /api/option 一样只允许 Root
	rootRoute := apiRouter.Group("/tokenfunc/groups")
	rootRoute.Use(middleware.RootAuth())
	{
		rootRoute.PUT("/settings", controller.SaveTokenFuncGroupSettings)
	}
	selfRoute := apiRouter.Group("/tokenfunc/groups")
	selfRoute.Use(middleware.UserAuth())
	{
		selfRoute.GET("/self", controller.ListTokenFuncSelfChannelGroups)
	}
}
