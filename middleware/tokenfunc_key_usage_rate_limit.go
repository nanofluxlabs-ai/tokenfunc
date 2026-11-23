package middleware

import (
	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

// KeyUsageRateLimit 公开用量查询页按 IP 限流（TokenFunc 二开），次数沿用搜索限流配置。
// 不用 SearchRateLimit：它按用户 ID 计数，企业员工的 key 都属于主账号，会让整个企业共用一个桶
func KeyUsageRateLimit() func(c *gin.Context) {
	if !common.SearchRateLimitEnable {
		return defNext
	}
	return rateLimitFactory(common.SearchRateLimitNum, common.SearchRateLimitDuration, "KU")
}
