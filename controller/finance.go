package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// 财务中心（TokenFunc 二开）：管理员只读报表。时间参数两种形式：
//   - start_date / end_date（YYYY-MM-DD，上海时区，闭区间）
//   - ts_start / ts_end（秒级时间戳，闭区间；账单详情用账期边界）
// 内部统一成半开区间 [start, endExcl)。

func financeApiError(c *gin.Context, err error) {
	if errors.Is(err, model.ErrFinanceInvalidRange) || errors.Is(err, model.ErrFinanceRangeTooLarge) {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if errors.Is(err, model.ErrEnterpriseResourceNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
		return
	}
	common.ApiError(c, err)
}

// financeDayRange 解析 start_date / end_date；缺省 end 为今天，start 为 end 往前 defaultDays-1 天
func financeDayRange(c *gin.Context, defaultDays int, maxDays int) (model.FinanceRange, bool) {
	endDay := c.Query("end_date")
	if endDay == "" {
		endDay = model.FinanceToday()
	}
	startDay := c.Query("start_date")
	if startDay == "" {
		end, err := time.ParseInLocation("2006-01-02", endDay, time.FixedZone("CST", 8*3600))
		if err != nil {
			common.ApiErrorMsg(c, "invalid end_date")
			return model.FinanceRange{}, false
		}
		startDay = end.AddDate(0, 0, -(defaultDays - 1)).Format("2006-01-02")
	}
	r, err := model.ParseFinanceDayRange(startDay, endDay)
	if err == nil && maxDays > 0 {
		err = r.CheckMaxDays(maxDays)
	}
	if err != nil {
		financeApiError(c, err)
		return model.FinanceRange{}, false
	}
	return r, true
}

// financeUsageRange 用量接口区间：ts_start / ts_end 优先，否则 start / end（兼容 start_date / end_date），缺省今天
func financeUsageRange(c *gin.Context, maxDays int) (model.FinanceRange, bool) {
	if c.Query("ts_start") != "" || c.Query("ts_end") != "" {
		tsStart, err1 := strconv.ParseInt(c.Query("ts_start"), 10, 64)
		tsEnd, err2 := strconv.ParseInt(c.Query("ts_end"), 10, 64)
		if err1 != nil || err2 != nil {
			common.ApiErrorMsg(c, "invalid ts_start / ts_end")
			return model.FinanceRange{}, false
		}
		r, err := model.FinanceRangeFromTimestamps(tsStart, tsEnd)
		if err == nil && maxDays > 0 {
			err = r.CheckMaxDays(maxDays)
		}
		if err != nil {
			financeApiError(c, err)
			return model.FinanceRange{}, false
		}
		return r, true
	}
	startDay, endDay := c.Query("start"), c.Query("end")
	if startDay == "" {
		startDay = c.Query("start_date")
	}
	if endDay == "" {
		endDay = c.Query("end_date")
	}
	if endDay == "" {
		endDay = model.FinanceToday()
	}
	if startDay == "" {
		startDay = endDay
	}
	r, err := model.ParseFinanceDayRange(startDay, endDay)
	if err == nil && maxDays > 0 {
		err = r.CheckMaxDays(maxDays)
	}
	if err != nil {
		financeApiError(c, err)
		return model.FinanceRange{}, false
	}
	return r, true
}

func financeUserIdQuery(c *gin.Context) (int, bool) {
	userId, err := strconv.Atoi(c.Query("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "user_id is required")
		return 0, false
	}
	return userId, true
}

// ---------------------------------------------------------------------------
// 经营看板 / 订单中心 / 用户消耗 / 模型消费
// ---------------------------------------------------------------------------

func AdminGetFinanceOverview(c *gin.Context) {
	r, ok := financeDayRange(c, 30, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	overview, err := model.GetFinanceOverview(r)
	if err != nil {
		financeApiError(c, err)
		return
	}
	common.ApiSuccess(c, overview)
}

func AdminListFinanceOrders(c *gin.Context) {
	r, ok := financeDayRange(c, 30, 0)
	if !ok {
		return
	}
	pageInfo := common.GetPageQuery(c)
	filter := model.FinanceOrderFilter{
		Range: r, Keyword: c.Query("keyword"), Username: c.Query("username"),
		OrderType: c.Query("order_type"), Status: c.Query("status"), PaymentMethod: c.Query("payment_method"),
	}
	for _, value := range []*string{&filter.OrderType, &filter.Status, &filter.PaymentMethod} {
		if *value == "all" {
			*value = ""
		}
	}
	items, total, err := model.ListFinanceOrders(filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		financeApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func AdminListFinanceUserConsumptions(c *gin.Context) {
	r, ok := financeDayRange(c, 1, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	pageInfo := common.GetPageQuery(c)
	filter := model.FinanceUserConsumptionFilter{Range: r, Keyword: c.Query("keyword")}
	if userId, err := strconv.Atoi(c.Query("user_id")); err == nil && userId > 0 {
		filter.UserId = userId
	}
	items, total, err := model.ListFinanceUserConsumptions(filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		financeApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func AdminListFinanceModelConsumptions(c *gin.Context) {
	r, ok := financeDayRange(c, 1, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	filter := model.FinanceModelConsumptionFilter{Range: r, ModelName: c.Query("model_name"), Username: c.Query("username"), Group: c.Query("group")}
	items, summary, err := model.ListFinanceModelConsumptions(filter)
	if err != nil {
		financeApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "summary": summary})
}

// ---------------------------------------------------------------------------
// 用量明细（用户消耗详情 / 账单详情共用）
// ---------------------------------------------------------------------------

func financePeriod(r model.FinanceRange) gin.H {
	return gin.H{"start": model.FinanceDay(r.Start), "end": model.FinanceDay(r.EndExcl - 1), "ts_start": r.Start, "ts_end": r.EndExcl - 1}
}

func AdminGetFinanceUsageSummary(c *gin.Context) {
	userId, ok := financeUserIdQuery(c)
	if !ok {
		return
	}
	r, ok := financeUsageRange(c, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	summary, err := model.GetFinanceUsageSummary(userId, r)
	if err != nil {
		financeApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"period": financePeriod(r), "total_calls": summary.TotalCalls, "total_quota": summary.TotalQuota, "total_amount_usd": summary.TotalAmountUSD,
		"by_model": summary.ByModel, "by_group_model": summary.ByGroupModel,
	})
}

func AdminGetFinanceUsageDaily(c *gin.Context) {
	userId, ok := financeUserIdQuery(c)
	if !ok {
		return
	}
	r, ok := financeUsageRange(c, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	daily, err := model.GetFinanceUsageDaily(userId, r)
	if err != nil {
		financeApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"period": financePeriod(r), "total_calls": daily.TotalCalls, "total_quota": daily.TotalQuota, "total_amount_usd": daily.TotalAmountUSD, "by_day": daily.ByDay,
	})
}

func AdminListFinanceUsageDetail(c *gin.Context) {
	userId, ok := financeUserIdQuery(c)
	if !ok {
		return
	}
	r, ok := financeUsageRange(c, 0)
	if !ok {
		return
	}
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.ListFinanceUsageDetail(userId, r, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		financeApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

// AdminExportFinanceUsage 导出 CSV；include_detail 缺省视为 true
func AdminExportFinanceUsage(c *gin.Context) {
	userId, ok := financeUserIdQuery(c)
	if !ok {
		return
	}
	r, ok := financeUsageRange(c, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	summary, err := model.GetFinanceUsageSummary(userId, r)
	if err != nil {
		financeApiError(c, err)
		return
	}
	daily, err := model.GetFinanceUsageDaily(userId, r)
	if err != nil {
		financeApiError(c, err)
		return
	}
	payload := service.FinanceUsageCSVPayload{
		StartDay: model.FinanceDay(r.Start), EndDay: model.FinanceDay(r.EndExcl - 1), Summary: summary, Daily: daily,
		IncludeDetail: c.DefaultQuery("include_detail", "true") != "false",
	}
	if payload.IncludeDetail {
		if payload.Details, err = model.ListFinanceUsageForExport(userId, r); err != nil {
			financeApiError(c, err)
			return
		}
	}
	var user model.User
	if err := model.DB.Unscoped().Select("id, username, email").Where("id = ?", userId).First(&user).Error; err == nil {
		payload.AccountLabel = user.Username
		if user.Email != "" {
			payload.AccountLabel = user.Username + " <" + user.Email + ">"
		}
	}
	if enterprise, err := model.GetEnterpriseByUserId(userId); err == nil && enterprise != nil {
		payload.EnterpriseName = enterprise.Name
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="usage-%d_%s_%s.csv"`, userId, payload.StartDay, payload.EndDay))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Status(http.StatusOK)
	if err := service.WriteFinanceUsageCSV(c.Writer, payload); err != nil {
		common.SysError("finance usage export failed: " + err.Error())
	}
}

// ---------------------------------------------------------------------------
// 企业账单
// ---------------------------------------------------------------------------

func AdminListFinanceBills(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := model.EnterpriseBillFilter{BillType: c.Query("bill_type"), Status: c.Query("status"), OverdueOnly: c.Query("overdue") == "true"}
	if id, err := strconv.Atoi(c.Query("enterprise_id")); err == nil && id > 0 {
		filter.EnterpriseId = id
	}
	list, err := model.ListFinanceBills(filter, c.Query("include_open") == "1" || c.Query("include_open") == "true", pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		financeApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"page": pageInfo.GetPage(), "page_size": pageInfo.GetPageSize(), "total": list.Total, "items": list.Items, "open_periods": list.OpenPeriods})
}

func AdminGetFinanceBill(c *gin.Context) {
	id, ok := paramBillId(c)
	if !ok {
		return
	}
	context, err := model.GetFinanceBillContext(c.Param("kind"), id)
	if err != nil {
		financeApiError(c, err)
		return
	}
	common.ApiSuccess(c, context)
}
