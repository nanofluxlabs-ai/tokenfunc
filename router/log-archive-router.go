package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerLogArchiveRoutes 注册 logs 归档清单路由（TokenFunc 二开，仅 Root）
func registerLogArchiveRoutes(apiRouter *gin.RouterGroup) {
	route := apiRouter.Group("/admin/log-archive")
	route.Use(middleware.RootAuth())
	{
		route.GET("/status", controller.AdminGetLogArchiveStatus)
		route.GET("/manifests", controller.AdminListLogArchiveManifests)
		route.POST("/manifests/:day/retry", controller.AdminRetryLogArchiveDay)
	}
}
