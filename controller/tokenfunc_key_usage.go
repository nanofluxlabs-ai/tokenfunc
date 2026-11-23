package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetKeyUsageLogs 公开用量查询页：凭 key 分页查本 key 的消费记录，可按时间与模型过滤（TokenFunc 二开）
func GetKeyUsageLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := logFilterFromQuery(c, false)
	// 只看消费记录；查询条件只开放时间与模型
	filter = model.LogFilter{Type: model.LogTypeConsume, StartTimestamp: filter.StartTimestamp, EndTimestamp: filter.EndTimestamp, ModelName: filter.ModelName}
	startTimestamp, err := limitLogTimeRange(filter.StartTimestamp, filter.EndTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	filter.StartTimestamp = startTimestamp
	logs, total, err := model.GetTokenLogs(c.GetInt("token_id"), filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}
