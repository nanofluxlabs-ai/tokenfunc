package controller

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// 账单账期包（TokenFunc 二开）：手动（重新）归档与下载。路由前缀 /api/admin/finance/bill-archives/:id

// AdminArchiveFinanceBill POST /api/admin/finance/bill-archives/:id
// 同步生成账期包并返回登记；用于不想等 5 分钟任务、或修数据后重做（对象同名覆盖，幂等）
func AdminArchiveFinanceBill(c *gin.Context) {
	id, ok := paramBillId(c)
	if !ok {
		return
	}
	bill, err := model.GetEnterpriseBill(id)
	if err != nil {
		financeApiError(c, err)
		return
	}
	info, err := service.ArchiveBill(c.Request.Context(), bill)
	if err != nil {
		if errors.Is(err, service.ErrLogArchiveStoreDisabled) {
			common.ApiErrorT(c, "Log archive object store is not configured")
			return
		}
		common.ApiError(c, err)
		return
	}
	enterprise, _ := model.GetEnterpriseById(bill.EnterpriseId)
	targetUserId := 0
	if enterprise != nil {
		targetUserId = enterprise.UserId
	}
	recordManageAuditFor(c, targetUserId, "bill.archive", map[string]any{
		"bill_no": bill.BillNo, "bill_id": bill.Id, "raw_rows": info.RawLogs.Rows, "detail_rows": info.Statement.Rows,
	})
	common.ApiSuccess(c, gin.H{"bill_id": bill.Id, "bill_no": bill.BillNo, "archived_at": info.ArchivedAt, "archive_info": info})
}

// AdminDownloadFinanceBillArchive GET /api/admin/finance/bill-archives/:id/:file（file = statement | raw-logs）
// 从对象存储透传 .csv.gz，不生成预签名 URL（桶私有，鉴权沿用控制台会话）
func AdminDownloadFinanceBillArchive(c *gin.Context) {
	id, ok := paramBillId(c)
	if !ok {
		return
	}
	bill, err := model.GetEnterpriseBill(id)
	if err != nil {
		financeApiError(c, err)
		return
	}
	body, size, filename, err := service.OpenBillArchiveObject(c.Request.Context(), bill, c.Param("file"))
	if err != nil {
		if errors.Is(err, model.ErrBillArchiveNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
			return
		}
		common.ApiError(c, err)
		return
	}
	defer body.Close()
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Header("Content-Type", "application/gzip")
	if size > 0 {
		c.Header("Content-Length", strconv.FormatInt(size, 10))
	}
	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, body); err != nil {
		common.SysError("bill archive download failed: " + err.Error())
	}
}
