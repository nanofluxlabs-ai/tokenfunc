package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// registerSiteAssetRoutes 站点素材（TokenFunc 二开）：Root 上传公开图片，访客经本站读取（COS 桶保持私有）
func registerSiteAssetRoutes(apiRouter *gin.RouterGroup) {
	apiRouter.POST("/site-assets", middleware.RootAuth(), middleware.CriticalRateLimit(), controller.UploadSiteAsset)
	apiRouter.GET("/site-assets/:kind/:name", controller.GetSiteAsset)
}
