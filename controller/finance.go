package controller

import (
	"compress/gzip"
	"errors"
	"fmt"
	"io"
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
		end, err := time.ParseInLocation("2006-01-02", endDay, model.BillingLocation())
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

// financeUsageSummary 等四个函数是管理员（指定 user_id）与个人（本人）两套路由的共同主体
func financeUsageSummary(c *gin.Context, userId int) {
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

func financeUsageDaily(c *gin.Context, userId int) {
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

func financeUsageDetail(c *gin.Context, userId int) {
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

func financeCSVHeaders(c *gin.Context, filename string) {
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Status(http.StatusOK)
}

// financeUsageExport 导出 CSV；include_detail 缺省视为 true
func financeUsageExport(c *gin.Context, userId int) {
	r, ok := financeUsageRange(c, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	payload, err := service.BuildFinanceUsageCSVPayload(userId, r, c.DefaultQuery("include_detail", "true") != "false")
	if err != nil {
		financeApiError(c, err)
		return
	}
	financeCSVHeaders(c, fmt.Sprintf("usage-%d_%s_%s.csv", userId, payload.StartDay, payload.EndDay))
	if err := service.WriteFinanceUsageCSV(c.Writer, payload); err != nil {
		common.SysError("finance usage export failed: " + err.Error())
	}
}

// ---------------------------------------------------------------------------
// 管理员用量接口：可选 bill_id。账单已归档且账期内 logs 已清理（或 source=archive 强制）时，
// 四个接口改从账期包的 JSON 旁路件取数，响应形状不变、多一个 "source":"archive"；
// 旧归档没有 JSON 件、或对象存储未配置时回落实时 logs（"source":"live"）。
// ---------------------------------------------------------------------------

// financeArchivedBillPayload 解析 bill_id 并判断是否走冻结件。返回 (nil, false) 表示走实时 logs；(nil, true) 表示错误已写回
func financeArchivedBillPayload(c *gin.Context, userId int) (*model.EnterpriseBill, *service.FinanceUsageCSVPayload, bool) {
	if c.Query("bill_id") == "" {
		return nil, nil, false
	}
	billId, err := strconv.ParseInt(c.Query("bill_id"), 10, 64)
	if err != nil || billId <= 0 {
		common.ApiErrorMsg(c, "invalid bill_id")
		return nil, nil, true
	}
	bill, err := model.GetEnterpriseBill(billId)
	if err != nil {
		financeApiError(c, err)
		return nil, nil, true
	}
	enterprise, err := model.GetEnterpriseById(bill.EnterpriseId)
	if err != nil {
		financeApiError(c, err)
		return nil, nil, true
	}
	if enterprise.UserId != userId {
		financeApiError(c, model.ErrEnterpriseResourceNotFound)
		return nil, nil, true
	}
	if bill.ArchivedAt == 0 {
		return nil, nil, false
	}
	if c.Query("source") != model.FinanceUsageSourceArchive {
		purged, err := model.BillPeriodLogsPurged(bill)
		if err != nil {
			financeApiError(c, err)
			return nil, nil, true
		}
		if !purged {
			return nil, nil, false
		}
	}
	payload, err := service.LoadBillStatementPayload(c.Request.Context(), bill)
	if err != nil {
		if errors.Is(err, model.ErrBillArchiveNotFound) || errors.Is(err, service.ErrLogArchiveStoreDisabled) {
			return nil, nil, false
		}
		common.ApiError(c, err)
		return nil, nil, true
	}
	return bill, payload, true
}

func financeBillPeriod(bill *model.EnterpriseBill) gin.H {
	return financePeriod(model.FinanceRange{Start: bill.PeriodStart, EndExcl: bill.PeriodEnd})
}

func AdminGetFinanceUsageSummary(c *gin.Context) {
	userId, ok := financeUserIdQuery(c)
	if !ok {
		return
	}
	bill, payload, handled := financeArchivedBillPayload(c, userId)
	if !handled {
		financeUsageSummary(c, userId)
		return
	}
	if payload == nil {
		return
	}
	summary := payload.Summary
	common.ApiSuccess(c, gin.H{
		"period": financeBillPeriod(bill), "total_calls": summary.TotalCalls, "total_quota": summary.TotalQuota, "total_amount_usd": summary.TotalAmountUSD,
		"by_model": summary.ByModel, "by_group_model": summary.ByGroupModel, "source": model.FinanceUsageSourceArchive,
	})
}

func AdminGetFinanceUsageDaily(c *gin.Context) {
	userId, ok := financeUserIdQuery(c)
	if !ok {
		return
	}
	bill, payload, handled := financeArchivedBillPayload(c, userId)
	if !handled {
		financeUsageDaily(c, userId)
		return
	}
	if payload == nil {
		return
	}
	daily := payload.Daily
	common.ApiSuccess(c, gin.H{
		"period": financeBillPeriod(bill), "total_calls": daily.TotalCalls, "total_quota": daily.TotalQuota, "total_amount_usd": daily.TotalAmountUSD,
		"by_day": daily.ByDay, "source": model.FinanceUsageSourceArchive,
	})
}

// AdminListFinanceUsageDetail 冻结件明细在内存里分页（冻结件已按时间倒序，与实时查询同序）
func AdminListFinanceUsageDetail(c *gin.Context) {
	userId, ok := financeUserIdQuery(c)
	if !ok {
		return
	}
	_, payload, handled := financeArchivedBillPayload(c, userId)
	if !handled {
		financeUsageDetail(c, userId)
		return
	}
	if payload == nil {
		return
	}
	if !payload.IncludeDetail {
		common.ApiErrorT(c, "Archived detail rows exceed the inline limit; download the statement snapshot instead")
		return
	}
	pageInfo := common.GetPageQuery(c)
	start := min(pageInfo.GetStartIdx(), len(payload.Details))
	end := min(start+pageInfo.GetPageSize(), len(payload.Details))
	common.ApiSuccess(c, gin.H{
		"page": pageInfo.GetPage(), "page_size": pageInfo.GetPageSize(), "total": len(payload.Details), "items": payload.Details[start:end],
		"source": model.FinanceUsageSourceArchive,
	})
}

// AdminExportFinanceUsage 冻结件导出：含明细时直接透传 statement.csv.gz（与对象逐字节一致），不含明细时用同一载荷重写
func AdminExportFinanceUsage(c *gin.Context) {
	userId, ok := financeUserIdQuery(c)
	if !ok {
		return
	}
	bill, payload, handled := financeArchivedBillPayload(c, userId)
	if !handled {
		financeUsageExport(c, userId)
		return
	}
	if payload == nil {
		return
	}
	filename := fmt.Sprintf("usage-%d_%s_%s.csv", userId, payload.StartDay, payload.EndDay)
	if c.DefaultQuery("include_detail", "true") == "false" {
		payload = &service.FinanceUsageCSVPayload{
			AccountLabel: payload.AccountLabel, EnterpriseName: payload.EnterpriseName, StartDay: payload.StartDay, EndDay: payload.EndDay,
			Summary: payload.Summary, Daily: payload.Daily,
		}
		financeCSVHeaders(c, filename)
		if err := service.WriteFinanceUsageCSV(c.Writer, *payload); err != nil {
			common.SysError("finance usage export (archive) failed: " + err.Error())
		}
		return
	}
	body, _, _, err := service.OpenBillArchiveObject(c.Request.Context(), bill, model.BillArchiveFileStatement)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer body.Close()
	reader, err := gzip.NewReader(body)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer reader.Close()
	financeCSVHeaders(c, filename)
	if _, err := io.Copy(c.Writer, reader); err != nil {
		common.SysError("finance usage export: stream archived statement failed: " + err.Error())
	}
}

// ---------------------------------------------------------------------------
// 个人财务对账：本人消费账单 + 钱包流水
// ---------------------------------------------------------------------------

func GetSelfFinanceUsageSummary(c *gin.Context) { financeUsageSummary(c, c.GetInt("id")) }
func GetSelfFinanceUsageDaily(c *gin.Context)   { financeUsageDaily(c, c.GetInt("id")) }
func GetSelfFinanceUsageDetail(c *gin.Context)  { financeUsageDetail(c, c.GetInt("id")) }
func GetSelfFinanceUsageExport(c *gin.Context)  { financeUsageExport(c, c.GetInt("id")) }

func GetSelfFinanceTopupSummary(c *gin.Context) {
	r, ok := financeUsageRange(c, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	entries, err := model.ListFinanceTopupEntries(c.GetInt("id"), r)
	if err != nil {
		financeApiError(c, err)
		return
	}
	summary := model.SummarizeFinanceTopup(entries)
	common.ApiSuccess(c, gin.H{
		"period": financePeriod(r), "total_entries": summary.TotalEntries, "total_quota": summary.TotalQuota,
		"total_amount_usd": summary.TotalAmountUSD, "by_source": summary.BySource,
	})
}

// GetSelfFinanceTopupDetail 流水明细；source 非空时只看该来源；流水在内存里分页
func GetSelfFinanceTopupDetail(c *gin.Context) {
	r, ok := financeUsageRange(c, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	entries, err := model.ListFinanceTopupEntries(c.GetInt("id"), r)
	if err != nil {
		financeApiError(c, err)
		return
	}
	if source := c.Query("source"); source != "" && source != "all" {
		filtered := entries[:0]
		for _, entry := range entries {
			if entry.Source == source {
				filtered = append(filtered, entry)
			}
		}
		entries = filtered
	}
	pageInfo := common.GetPageQuery(c)
	start := min(pageInfo.GetStartIdx(), len(entries))
	end := min(start+pageInfo.GetPageSize(), len(entries))
	pageInfo.SetTotal(len(entries))
	pageInfo.SetItems(entries[start:end])
	common.ApiSuccess(c, pageInfo)
}

func GetSelfFinanceTopupExport(c *gin.Context) {
	r, ok := financeUsageRange(c, model.FinanceMaxRangeDays)
	if !ok {
		return
	}
	userId := c.GetInt("id")
	entries, err := model.ListFinanceTopupEntries(userId, r)
	if err != nil {
		financeApiError(c, err)
		return
	}
	payload := service.FinanceTopupCSVPayload{
		StartDay: model.FinanceDay(r.Start), EndDay: model.FinanceDay(r.EndExcl - 1), Summary: model.SummarizeFinanceTopup(entries), Entries: entries,
	}
	payload.AccountLabel, payload.EnterpriseName = service.FinanceExportSubject(userId)
	financeCSVHeaders(c, fmt.Sprintf("topup-%d_%s_%s.csv", userId, payload.StartDay, payload.EndDay))
	if err := service.WriteFinanceTopupCSV(c.Writer, payload); err != nil {
		common.SysError("finance topup export failed: " + err.Error())
	}
}

// ---------------------------------------------------------------------------
// 企业账单
// ---------------------------------------------------------------------------

func AdminListFinanceBills(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := model.EnterpriseBillFilter{BillType: c.Query("bill_type"), Status: c.Query("status"), OverdueOnly: c.Query("overdue") == "true", ReconcileDiffOnly: c.Query("reconcile") == "diff"}
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
