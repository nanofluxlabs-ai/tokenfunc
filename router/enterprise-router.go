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
	}
}
