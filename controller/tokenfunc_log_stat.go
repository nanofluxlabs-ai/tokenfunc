package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// logStatResponse 日志页统计徽标；ErrorLogEnabled 为 false 时没有错误日志，前端不展示失败率
type logStatResponse struct {
	model.LogStatSummary
	ErrorLogEnabled bool `json:"error_log_enabled"`
}

// GetLogsSummary 管理员视角的日志统计（TokenFunc 二开），筛选条件与 GET /api/log/ 一致
func GetLogsSummary(c *gin.Context) {
	stat, err := model.SumLogStat(0, logFilterFromQuery(c, true))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, logStatResponse{LogStatSummary: stat, ErrorLogEnabled: constant.ErrorLogEnabled})
}

// GetLogsSelfSummary 当前用户的日志统计，筛选条件与 GET /api/log/self 一致（含普通用户的区间上限）
func GetLogsSelfSummary(c *gin.Context) {
	filter := logFilterFromQuery(c, false)
	if c.GetInt("role") < common.RoleAdminUser {
		startTimestamp, err := limitLogTimeRange(filter.StartTimestamp, filter.EndTimestamp)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		filter.StartTimestamp = startTimestamp
	}
	stat, err := model.SumLogStat(c.GetInt("id"), filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, logStatResponse{LogStatSummary: stat, ErrorLogEnabled: constant.ErrorLogEnabled})
}
