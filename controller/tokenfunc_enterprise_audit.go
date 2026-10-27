package controller

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// enterpriseAuditRoute 企业控制台审计视角（TokenFunc 二开），与 /api/audit 共用 GetAuditLogs
const enterpriseAuditRoute = "/api/enterprise/audit"

// applyTokenfuncAuditScope 企业审计：限定本企业、按普通用户投影字段；返回 false 表示已写出错误响应
func applyTokenfuncAuditScope(c *gin.Context, filter *model.AuditLogFilter, viewerRole *int) bool {
	if c.FullPath() != enterpriseAuditRoute {
		return true
	}
	if err := model.EnterpriseAuditSupported(); err != nil {
		common.ApiError(c, err)
		return false
	}
	filter.EnterpriseId = currentEnterprise(c).Id
	filter.UserId = 0
	filter.SelfView = true
	*viewerRole = common.RoleCommonUser
	return true
}

// recordEnterpriseExportAudit 导出已写出附件头（即导出成功开始）时记一条企业审计，文件名体现导出范围
func recordEnterpriseExportAudit(c *gin.Context, action string, params map[string]any) {
	disposition := c.Writer.Header().Get("Content-Disposition")
	if disposition == "" {
		return
	}
	if params == nil {
		params = map[string]any{}
	}
	_, filename, _ := strings.Cut(disposition, "filename=")
	params["file"] = strings.Trim(filename, `"`)
	recordEnterpriseConsoleAudit(c, action, params)
}
