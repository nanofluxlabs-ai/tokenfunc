package controller

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// usageRange 解析 from/to（YYYY-MM-DD），缺省最近 30 天，最长 366 天
func usageRange(c *gin.Context) (string, string, bool) {
	from, to := model.DefaultEnterpriseUsageRange()
	if value := c.Query("from"); value != "" {
		from = value
	}
	if value := c.Query("to"); value != "" {
		to = value
	}
	for _, day := range []string{from, to} {
		if err := model.ValidateEnterpriseUsageDay(day); err != nil {
			common.ApiErrorMsg(c, err.Error())
			return "", "", false
		}
	}
	if from > to {
		common.ApiErrorMsg(c, "from must not be later than to")
		return "", "", false
	}
	return from, to, true
}

// usageFilter 解析下钻过滤（团队 / 成员），并把当前身份的范围并进去
func usageFilter(c *gin.Context, scope model.EnterpriseScope) model.EnterpriseUsageFilter {
	return model.EnterpriseUsageFilter{
		TeamId:   optionalIntQuery(c, "team_id"),
		MemberId: optionalIntQuery(c, "member_id"),
	}.WithScope(scope)
}

func writeEnterpriseUsageSummary(c *gin.Context, enterpriseId int, scope model.EnterpriseScope) {
	from, to, ok := usageRange(c)
	if !ok {
		return
	}
	groupBy := c.DefaultQuery("group_by", model.EnterpriseUsageGroupTeam)
	items, err := model.SummarizeEnterpriseUsage(enterpriseId, groupBy, from, to, usageFilter(c, scope))
	if errors.Is(err, model.ErrEnterpriseUsageGroup) {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"from": from, "to": to, "group_by": groupBy, "items": items})
}

// writeEnterpriseUsageExport 导出 CSV（带 BOM，Excel 直接打开不乱码），金额列为 USD
func writeEnterpriseUsageExport(c *gin.Context, enterpriseId int, scope model.EnterpriseScope) {
	from, to, ok := usageRange(c)
	if !ok {
		return
	}
	rows, err := model.ExportEnterpriseUsage(enterpriseId, from, to, usageFilter(c, scope))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var buffer bytes.Buffer
	buffer.WriteString("\uFEFF")
	writer := csv.NewWriter(&buffer)
	_ = writer.Write([]string{"day", "team", "member", "api_key", "model", "requests", "prompt_tokens", "cache_tokens", "cache_creation_tokens", "completion_tokens", "amount_usd"})
	for _, row := range rows {
		_ = writer.Write([]string{
			row.Day, row.TeamName, row.MemberName, row.TokenName, row.ModelName,
			strconv.FormatInt(row.RequestCount, 10), strconv.FormatInt(row.PromptTokens, 10),
			strconv.FormatInt(row.CacheTokens, 10), strconv.FormatInt(row.CacheCreationTokens, 10),
			strconv.FormatInt(row.CompletionTokens, 10),
			strconv.FormatFloat(float64(row.Quota)/common.QuotaPerUnit, 'f', 6, 64),
		})
	}
	writer.Flush()
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="usage-%d-%s-%s.csv"`, enterpriseId, from, to))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buffer.Bytes())
}

func GetEnterpriseUsageSummary(c *gin.Context) {
	writeEnterpriseUsageSummary(c, currentEnterprise(c).Id, currentScope(c))
}

func ExportEnterpriseUsageSelf(c *gin.Context) {
	writeEnterpriseUsageExport(c, currentEnterprise(c).Id, currentScope(c))
}

func AdminGetEnterpriseUsageSummary(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	writeEnterpriseUsageSummary(c, id, model.EnterpriseScope{})
}

func AdminExportEnterpriseUsage(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	writeEnterpriseUsageExport(c, id, model.EnterpriseScope{})
}
