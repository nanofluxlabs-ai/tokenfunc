package controller

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// 「渠道消耗」页（TokenFunc 二开）：列表 / 展开明细 / 回填。

// channelUsageMaxRangeDays 所选日期区间的最大跨度（含首尾），限制 channel_hourly_usages 的单次扫描量
const channelUsageMaxRangeDays = 366

type channelUsageItem struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	Type         int    `json:"type"`
	Status       int    `json:"status"`
	Group        string `json:"group"`
	Tag          string `json:"tag"`
	Priority     int64  `json:"priority"`
	Weight       uint   `json:"weight"`
	ResponseTime int    `json:"response_time"`
	CreatedTime  int64  `json:"created_time"`
	Remark       string `json:"remark"`
	// Quota = 用户实际扣费（已应用分组折扣）；OfficialQuota = 官方价产出价值（不含分组折扣）
	TotalQuota            int64 `json:"total_quota"`
	TotalOfficialQuota    int64 `json:"total_official_quota"`
	TotalPromptTokens     int64 `json:"total_prompt_tokens"`
	TotalCompletionTokens int64 `json:"total_completion_tokens"`
	TotalCallCount        int64 `json:"total_call_count"`
	RangeQuota            int64 `json:"range_quota"`
	RangeOfficialQuota    int64 `json:"range_official_quota"`
	RangePromptTokens     int64 `json:"range_prompt_tokens"`
	RangeCompletionTokens int64 `json:"range_completion_tokens"`
	RangeCallCount        int64 `json:"range_call_count"`
	MonthQuota            int64 `json:"month_quota"`
	MonthOfficialQuota    int64 `json:"month_official_quota"`
	MonthPromptTokens     int64 `json:"month_prompt_tokens"`
	MonthCompletionTokens int64 `json:"month_completion_tokens"`
	MonthCallCount        int64 `json:"month_call_count"`
}

type channelUsageSummary struct {
	TotalQuota            int64 `json:"total_quota"`
	TotalOfficialQuota    int64 `json:"total_official_quota"`
	TotalCallCount        int64 `json:"total_call_count"`
	TotalPromptTokens     int64 `json:"total_prompt_tokens"`
	TotalCompletionTokens int64 `json:"total_completion_tokens"`
	RangeQuota            int64 `json:"range_quota"`
	RangeOfficialQuota    int64 `json:"range_official_quota"`
	RangeCallCount        int64 `json:"range_call_count"`
	RangePromptTokens     int64 `json:"range_prompt_tokens"`
	RangeCompletionTokens int64 `json:"range_completion_tokens"`
	MonthQuota            int64 `json:"month_quota"`
	MonthOfficialQuota    int64 `json:"month_official_quota"`
	MonthCallCount        int64 `json:"month_call_count"`
	MonthPromptTokens     int64 `json:"month_prompt_tokens"`
	MonthCompletionTokens int64 `json:"month_completion_tokens"`
	// 所选区间 [RangeStartTs, RangeEndTs)（Unix 秒，计费时区自然日边界）；默认区间 = 今天
	RangeStartTs int64 `json:"range_start_ts"`
	RangeEndTs   int64 `json:"range_end_ts"`
	MonthStartTs int64 `json:"month_start_ts"`
}

// GetChannelUsageStats 渠道消耗统计列表
//   - 总计来自 channel_usage_totals + channels.used_quota（O(1) 读取）
//   - 所选日期区间（start_date / end_date，默认今天）与自然月各做一次 channel_hourly_usages 的 SQL 聚合
//   - 筛选、排序、分页在内存做（渠道数级别小）
func GetChannelUsageStats(c *gin.Context) {
	r, err := service.ResolveChannelUsageDayRange(c.Query("start_date"), c.Query("end_date"), channelUsageMaxRangeDays)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	statusParam := strings.TrimSpace(c.Query("status"))
	typeParam := strings.TrimSpace(c.Query("type"))
	tagParam := strings.TrimSpace(c.Query("tag"))
	sortKey := strings.TrimSpace(c.Query("sort"))
	if sortKey == "" {
		sortKey = "range_official_quota"
	}
	order := strings.ToLower(strings.TrimSpace(c.Query("order")))
	if order != "asc" {
		order = "desc"
	}
	page, _ := strconv.Atoi(c.Query("page"))
	page = max(page, 1)
	size, _ := strconv.Atoi(c.Query("size"))
	if size <= 0 || size > 200 {
		size = 20
	}

	tx := model.DB.Model(&model.Channel{})
	if keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("name LIKE ? OR remark LIKE ?", like, like)
	}
	if v, err := strconv.Atoi(statusParam); err == nil && statusParam != "" {
		tx = tx.Where("status = ?", v)
	}
	if v, err := strconv.Atoi(typeParam); err == nil && typeParam != "" {
		tx = tx.Where("type = ?", v)
	}
	if tagParam != "" {
		tx = tx.Where("tag = ?", tagParam)
	}
	var channels []model.Channel
	if err := tx.Omit("key").Find(&channels).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	monthStart := model.ChannelUsageMonthStart(common.GetTimestamp())
	rangeMap, err := model.SumChannelUsageBetween(r.Start, r.EndExcl)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	monthMap, err := model.SumChannelUsageBetween(monthStart, 0)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	totals, err := model.GetChannelUsageTotals()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]channelUsageItem, 0, len(channels))
	for _, ch := range channels {
		rng := rangeMap[ch.Id]
		month := monthMap[ch.Id]
		total := totals[ch.Id]
		item := channelUsageItem{
			ID:                    ch.Id,
			Name:                  ch.Name,
			Type:                  ch.Type,
			Status:                ch.Status,
			Group:                 ch.Group,
			ResponseTime:          ch.ResponseTime,
			CreatedTime:           ch.CreatedTime,
			TotalQuota:            ch.UsedQuota,
			TotalOfficialQuota:    total.OfficialQuota,
			TotalPromptTokens:     total.PromptTokens,
			TotalCompletionTokens: total.CompletionTokens,
			TotalCallCount:        total.CallCount,
			RangeQuota:            rng.Quota,
			RangeOfficialQuota:    rng.OfficialQuota,
			RangePromptTokens:     rng.PromptTokens,
			RangeCompletionTokens: rng.CompletionTokens,
			RangeCallCount:        rng.CallCount,
			MonthQuota:            month.Quota,
			MonthOfficialQuota:    month.OfficialQuota,
			MonthPromptTokens:     month.PromptTokens,
			MonthCompletionTokens: month.CompletionTokens,
			MonthCallCount:        month.CallCount,
		}
		if ch.Tag != nil {
			item.Tag = *ch.Tag
		}
		if ch.Priority != nil {
			item.Priority = *ch.Priority
		}
		if ch.Weight != nil {
			item.Weight = *ch.Weight
		}
		if ch.Remark != nil {
			item.Remark = *ch.Remark
		}
		items = append(items, item)
	}
	sortChannelUsageItems(items, sortKey, order)

	total := len(items)
	startIdx := min((page-1)*size, total)
	endIdx := min(startIdx+size, total)
	summary := computeChannelUsageSummary(items, r.Start, r.EndExcl, monthStart)

	// 按渠道类型统计数量（不带其他筛选，给顶部 tab 用）
	typeCountRows := make([]struct {
		Type  int   `gorm:"column:type"`
		Count int64 `gorm:"column:count"`
	}, 0)
	if err := model.DB.Model(&model.Channel{}).Select("type, COUNT(*) AS count").Group("type").Order("type ASC").Scan(&typeCountRows).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	typeCounts := make(map[string]int64, len(typeCountRows)+1)
	availableTypes := make([]int, 0, len(typeCountRows))
	var grandTotal int64
	for _, row := range typeCountRows {
		typeCounts[strconv.Itoa(row.Type)] = row.Count
		availableTypes = append(availableTypes, row.Type)
		grandTotal += row.Count
	}
	typeCounts["all"] = grandTotal

	common.ApiSuccess(c, gin.H{
		"total":           total,
		"page":            page,
		"size":            size,
		"items":           items[startIdx:endIdx],
		"summary":         summary,
		"available_types": availableTypes,
		"type_counts":     typeCounts,
	})
}

func sortChannelUsageItems(items []channelUsageItem, sortKey string, order string) {
	less := func(a, b channelUsageItem) bool {
		switch sortKey {
		case "name":
			return a.Name < b.Name
		case "type":
			return a.Type < b.Type
		case "status":
			return a.Status < b.Status
		case "total_call_count":
			return a.TotalCallCount < b.TotalCallCount
		case "total_quota":
			return a.TotalQuota < b.TotalQuota
		case "total_official_quota":
			return a.TotalOfficialQuota < b.TotalOfficialQuota
		case "range_quota":
			return a.RangeQuota < b.RangeQuota
		case "range_call_count":
			return a.RangeCallCount < b.RangeCallCount
		case "month_official_quota":
			return a.MonthOfficialQuota < b.MonthOfficialQuota
		case "month_quota":
			return a.MonthQuota < b.MonthQuota
		case "month_call_count":
			return a.MonthCallCount < b.MonthCallCount
		default: // range_official_quota 与未知 key
			return a.RangeOfficialQuota < b.RangeOfficialQuota
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if order == "asc" {
			return less(items[i], items[j])
		}
		return less(items[j], items[i])
	})
}

func computeChannelUsageSummary(items []channelUsageItem, rangeStart int64, rangeEnd int64, monthStart int64) channelUsageSummary {
	s := channelUsageSummary{RangeStartTs: rangeStart, RangeEndTs: rangeEnd, MonthStartTs: monthStart}
	for _, it := range items {
		s.TotalQuota += it.TotalQuota
		s.TotalOfficialQuota += it.TotalOfficialQuota
		s.TotalCallCount += it.TotalCallCount
		s.TotalPromptTokens += it.TotalPromptTokens
		s.TotalCompletionTokens += it.TotalCompletionTokens
		s.RangeQuota += it.RangeQuota
		s.RangeOfficialQuota += it.RangeOfficialQuota
		s.RangeCallCount += it.RangeCallCount
		s.RangePromptTokens += it.RangePromptTokens
		s.RangeCompletionTokens += it.RangeCompletionTokens
		s.MonthQuota += it.MonthQuota
		s.MonthOfficialQuota += it.MonthOfficialQuota
		s.MonthCallCount += it.MonthCallCount
		s.MonthPromptTokens += it.MonthPromptTokens
		s.MonthCompletionTokens += it.MonthCompletionTokens
	}
	return s
}

// BackfillChannelUsage Root 手动触发的全量回填：用 logs 重建小时桶与累计表；同步执行
func BackfillChannelUsage(c *gin.Context) {
	timeout := 30 * time.Minute
	if v, err := strconv.Atoi(strings.TrimSpace(c.Query("timeout_seconds"))); err == nil && v > 0 {
		timeout = time.Duration(v) * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	common.SysLog("admin triggered channel usage backfill")
	report, err := service.BackfillChannelUsage(ctx)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error(), "data": report})
		return
	}
	common.ApiSuccess(c, report)
}

// channelBreakdownMaxChannels 单次明细请求的渠道数上限（「全部展开」按当前页请求，页大小上限 200）
const channelBreakdownMaxChannels = 200

// parseChannelBreakdownIds 解析 channel_ids（逗号分隔的正整数，去重保序）
func parseChannelBreakdownIds(raw string) ([]int, error) {
	ids := make([]int, 0)
	seen := make(map[int]bool)
	for part := range strings.SplitSeq(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := strconv.Atoi(part)
		if err != nil || id <= 0 {
			return nil, fmt.Errorf("invalid channel_ids")
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("channel_ids is required")
	}
	if len(ids) > channelBreakdownMaxChannels {
		return nil, fmt.Errorf("at most %d channels per request", channelBreakdownMaxChannels)
	}
	return ids, nil
}

// GetChannelUsageBreakdown 渠道消耗页展开明细：所选区间内各渠道的付款主体 Top N 与模型 Top N。
// 数据源 channel_daily_dim_usages，与列表的区间价值同源；日期口径与列表一致。
func GetChannelUsageBreakdown(c *gin.Context) {
	ids, err := parseChannelBreakdownIds(c.Query("channel_ids"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	r, err := service.ResolveChannelUsageDayRange(c.Query("start_date"), c.Query("end_date"), channelUsageMaxRangeDays)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	payerId, _ := strconv.Atoi(c.Query("payer_id"))
	result, err := service.GetChannelUsageBreakdown(service.ChannelBreakdownQuery{
		ChannelIds:   ids,
		StartTs:      r.Start,
		EndExclusive: r.EndExcl,
		Metric:       strings.TrimSpace(c.Query("metric")),
		Limit:        limit,
		PayerId:      payerId,
		ModelName:    strings.TrimSpace(c.Query("model_name")),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

// StartChannelDimUsageBackfill Root 手动触发明细表历史回填（异步）：start_date / end_date 为自然日闭区间，
// 只重建已完结的自然日；进度用 GET 同路径查询。
func StartChannelDimUsageBackfill(c *gin.Context) {
	status, err := service.StartChannelDimUsageBackfill(c.Query("start_date"), c.Query("end_date"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error(), "data": status})
		return
	}
	common.SysLog(fmt.Sprintf("admin triggered channel dim usage backfill: %s~%s", status.StartDate, status.EndDate))
	common.ApiSuccess(c, status)
}

// GetChannelDimUsageBackfillStatus 查询本实例最近一次明细回填的进度
func GetChannelDimUsageBackfillStatus(c *gin.Context) {
	common.ApiSuccess(c, service.GetChannelDimBackfillStatus())
}
