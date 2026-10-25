package controller

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// logs 归档清单（TokenFunc 二开，Root）：状态头 + 按天清单 + 单日重试

func AdminGetLogArchiveStatus(c *gin.Context) {
	summary, err := model.GetLogArchiveManifestSummary()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"status": service.GetLogRetentionStatus(time.Now()), "summary": summary})
}

func AdminListLogArchiveManifests(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.ListLogArchiveManifests(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

// AdminRetryLogArchiveDay 对某一天重新执行「归档 → 复核 → 删除」，受保留期 / 预聚合游标 / 护栏约束
func AdminRetryLogArchiveDay(c *gin.Context) {
	day := c.Param("day")
	manifest, err := service.RetryLogArchiveDay(c.Request.Context(), day, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, 0, "log_archive.retry", map[string]any{"day": day, "status": manifest.Status, "rows": manifest.RowCount})
	common.ApiSuccess(c, manifest)
}
