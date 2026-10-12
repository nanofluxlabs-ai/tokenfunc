package service

import (
	"fmt"
	"sort"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// 「渠道消耗」页展开明细：单个或一批渠道在所选区间内的「付款主体 Top N」与「模型 Top N」。
// 数据源 channel_daily_dim_usages（与渠道消耗页同源同口径，不扫 logs）。
// TokenFunc 里员工不登录、消费日志的 user_id 就是企业主账号，所以付款主体 = user_id，无需再按团队合并。

const (
	ChannelBreakdownMetricOfficial = "official" // 按官方价产出价值（剥离分组折扣），与渠道行主数字同口径
	ChannelBreakdownMetricActual   = "actual"   // 按实际扣费（倍率后），与余额 / 财务中心同底数

	channelBreakdownDefaultLimit = 5
	channelBreakdownMaxLimit     = 20
	// channelBreakdownRunwayDays 估算「约可用天数」的日均窗口（已完结自然日）
	channelBreakdownRunwayDays = 7
)

// ChannelBreakdownQuery 明细查询入参。PayerId / ModelName 为面板内交叉筛选，只在单渠道查询时生效：
// PayerId>0 → 模型维度只统计该付款主体；ModelName 非空 → 用户维度只统计该模型。
type ChannelBreakdownQuery struct {
	ChannelIds   []int
	StartTs      int64
	EndExclusive int64
	Metric       string
	Limit        int
	PayerId      int
	ModelName    string
}

// ChannelUsageAmount 一组用量数字（quota 单位）
type ChannelUsageAmount struct {
	OfficialQuota    int64 `json:"official_quota"`
	Quota            int64 `json:"quota"`
	CallCount        int64 `json:"call_count"`
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
}

func (a *ChannelUsageAmount) add(o ChannelUsageAmount) {
	a.OfficialQuota += o.OfficialQuota
	a.Quota += o.Quota
	a.CallCount += o.CallCount
	a.PromptTokens += o.PromptTokens
	a.CompletionTokens += o.CompletionTokens
}

func (a ChannelUsageAmount) metricValue(metric string) int64 {
	if metric == ChannelBreakdownMetricActual {
		return a.Quota
	}
	return a.OfficialQuota
}

func amountFromDimAgg(r model.ChannelDimUsageAgg) ChannelUsageAmount {
	return ChannelUsageAmount{
		OfficialQuota:    r.OfficialQuota,
		Quota:            r.Quota,
		CallCount:        r.CallCount,
		PromptTokens:     r.PromptTokens,
		CompletionTokens: r.CompletionTokens,
	}
}

// ChannelBreakdownPayer 一个付款主体在该渠道的用量与账户状态。
// 余额口径同财务中心「用户消耗」：预付看钱包余额；授信企业看当前账期（本期已用 / 额度）。
type ChannelBreakdownPayer struct {
	PayerId        int    `json:"payer_id"` // 0 = 系统请求（渠道测试等 user_id=0 的消费）
	Username       string `json:"username"`
	Group          string `json:"group"`
	Status         int    `json:"status"`
	IsEnterprise   bool   `json:"is_enterprise"`
	EnterpriseName string `json:"enterprise_name,omitempty"`
	ChannelUsageAmount
	// 账户
	BillingMode     string                         `json:"billing_mode,omitempty"`
	RemainQuota     int                            `json:"remain_quota"`
	CreditPeriod    *model.FinanceCreditPeriodView `json:"credit_period,omitempty"`
	HasSubscription bool                           `json:"has_subscription"`
	// AvgDailyConsume 近 7 个完结自然日的日均净消耗（全渠道），仅预付且无生效订阅时下发，
	// 0 = 未知或无消耗；前端据此估算「约可用天数」。
	AvgDailyConsume int64 `json:"avg_daily_consume"`
}

// ChannelBreakdownModel 一个模型在该渠道的用量
type ChannelBreakdownModel struct {
	ModelName string `json:"model_name"`
	ChannelUsageAmount
}

// ChannelBreakdownUsers 用户维度：Top N + 其余合计。Total 为本维度（含筛选）合计，是占比分母。
type ChannelBreakdownUsers struct {
	Items       []ChannelBreakdownPayer `json:"items"`
	Count       int                     `json:"count"`
	Others      ChannelUsageAmount      `json:"others"`
	OthersCount int                     `json:"others_count"`
	Total       ChannelUsageAmount      `json:"total"`
}

// ChannelBreakdownModels 模型维度：Top N + 其余合计
type ChannelBreakdownModels struct {
	Items       []ChannelBreakdownModel `json:"items"`
	Count       int                     `json:"count"`
	Others      ChannelUsageAmount      `json:"others"`
	OthersCount int                     `json:"others_count"`
	Total       ChannelUsageAmount      `json:"total"`
}

// ChannelBreakdown 单个渠道的明细
type ChannelBreakdown struct {
	ChannelId int                    `json:"channel_id"`
	Users     ChannelBreakdownUsers  `json:"users"`
	Models    ChannelBreakdownModels `json:"models"`
}

// ChannelBreakdownResult 明细接口返回
type ChannelBreakdownResult struct {
	RangeStartTs int64  `json:"range_start_ts"`
	RangeEndTs   int64  `json:"range_end_ts"`
	Metric       string `json:"metric"`
	// CoverageStartTs 明细表最早的数据日（零点），0 = 尚无数据；区间早于它的部分没有明细
	CoverageStartTs int64              `json:"coverage_start_ts"`
	Items           []ChannelBreakdown `json:"items"`
}

// NormalizeChannelBreakdownMetric 非法值回落默认口径（官方价值）
func NormalizeChannelBreakdownMetric(metric string) string {
	if metric == ChannelBreakdownMetricActual {
		return ChannelBreakdownMetricActual
	}
	return ChannelBreakdownMetricOfficial
}

// GetChannelUsageBreakdown 渠道明细：两次小表聚合 → 内存排序取 Top → 只对 Top 行装配账户信息。
func GetChannelUsageBreakdown(q ChannelBreakdownQuery) (*ChannelBreakdownResult, error) {
	q.Metric = NormalizeChannelBreakdownMetric(q.Metric)
	if q.Limit <= 0 {
		q.Limit = channelBreakdownDefaultLimit
	}
	q.Limit = min(q.Limit, channelBreakdownMaxLimit)
	result := &ChannelBreakdownResult{
		RangeStartTs: q.StartTs,
		RangeEndTs:   q.EndExclusive,
		Metric:       q.Metric,
		Items:        make([]ChannelBreakdown, 0, len(q.ChannelIds)),
	}
	if len(q.ChannelIds) == 0 {
		return result, nil
	}
	coverage, err := model.GetChannelDimUsageCoverageStart()
	if err != nil {
		return nil, err
	}
	result.CoverageStartTs = coverage

	// 交叉筛选只对单渠道有意义（「全部展开」的批量请求不带筛选）
	modelFilter := ""
	var payerFilter []int
	if len(q.ChannelIds) == 1 {
		modelFilter = q.ModelName
		if q.PayerId > 0 {
			payerFilter = []int{q.PayerId}
		}
	}

	userRows, err := model.AggregateChannelDimUsageByUser(q.ChannelIds, q.StartTs, q.EndExclusive, modelFilter)
	if err != nil {
		return nil, err
	}
	modelRows, err := model.AggregateChannelDimUsageByModel(q.ChannelIds, q.StartTs, q.EndExclusive, payerFilter)
	if err != nil {
		return nil, err
	}

	userRowsByChannel := make(map[int][]model.ChannelDimUsageAgg)
	for _, r := range userRows {
		userRowsByChannel[r.ChannelId] = append(userRowsByChannel[r.ChannelId], r)
	}
	modelRowsByChannel := make(map[int][]model.ChannelDimUsageAgg)
	for _, r := range modelRows {
		modelRowsByChannel[r.ChannelId] = append(modelRowsByChannel[r.ChannelId], r)
	}

	for _, channelId := range q.ChannelIds {
		result.Items = append(result.Items, ChannelBreakdown{
			ChannelId: channelId,
			Users:     buildChannelBreakdownUsers(userRowsByChannel[channelId], q.Metric, q.Limit),
			Models:    buildChannelBreakdownModels(modelRowsByChannel[channelId], q.Metric, q.Limit),
		})
	}
	if err := decorateChannelBreakdownPayers(result.Items); err != nil {
		return nil, err
	}
	return result, nil
}

// buildChannelBreakdownUsers 单渠道的用户行排序后取 Top N，其余并入 Others；user_id<=0 归系统请求 0
func buildChannelBreakdownUsers(rows []model.ChannelDimUsageAgg, metric string, limit int) ChannelBreakdownUsers {
	out := ChannelBreakdownUsers{Items: []ChannelBreakdownPayer{}}
	payers := make([]ChannelBreakdownPayer, 0, len(rows))
	for _, r := range rows {
		amount := amountFromDimAgg(r)
		out.Total.add(amount)
		payers = append(payers, ChannelBreakdownPayer{PayerId: max(r.UserId, 0), ChannelUsageAmount: amount})
	}
	sort.Slice(payers, func(i, j int) bool {
		return channelBreakdownLess(payers[i].ChannelUsageAmount, payers[j].ChannelUsageAmount, metric, payers[i].PayerId < payers[j].PayerId)
	})
	out.Count = len(payers)
	for i, payer := range payers {
		if i >= limit {
			out.Others.add(payer.ChannelUsageAmount)
			out.OthersCount++
			continue
		}
		out.Items = append(out.Items, payer)
	}
	return out
}

// buildChannelBreakdownModels 单渠道的模型行排序后取 Top N，其余并入 Others。
func buildChannelBreakdownModels(rows []model.ChannelDimUsageAgg, metric string, limit int) ChannelBreakdownModels {
	out := ChannelBreakdownModels{Items: []ChannelBreakdownModel{}}
	items := make([]ChannelBreakdownModel, 0, len(rows))
	for _, r := range rows {
		amount := amountFromDimAgg(r)
		out.Total.add(amount)
		items = append(items, ChannelBreakdownModel{ModelName: r.ModelName, ChannelUsageAmount: amount})
	}
	sort.Slice(items, func(i, j int) bool {
		return channelBreakdownLess(items[i].ChannelUsageAmount, items[j].ChannelUsageAmount, metric, items[i].ModelName < items[j].ModelName)
	})
	out.Count = len(items)
	for i, item := range items {
		if i >= limit {
			out.Others.add(item.ChannelUsageAmount)
			out.OthersCount++
			continue
		}
		out.Items = append(out.Items, item)
	}
	return out
}

// channelBreakdownLess 降序：所选口径 → 调用次数 → 稳定键（tieLess 为 a 的键小于 b）
func channelBreakdownLess(a, b ChannelUsageAmount, metric string, tieLess bool) bool {
	if av, bv := a.metricValue(metric), b.metricValue(metric); av != bv {
		return av > bv
	}
	if a.CallCount != b.CallCount {
		return a.CallCount > b.CallCount
	}
	return tieLess
}

// decorateChannelBreakdownPayers 对全部渠道 Top 行里出现的付款主体批量装配用户 / 企业 / 授信账期 /
// 订阅 / 日均消耗。全部为普通表按 id 批量读；日均消耗只对预付且无订阅的用户查一次 logs。
func decorateChannelBreakdownPayers(items []ChannelBreakdown) error {
	payerIds := make([]int, 0)
	seen := make(map[int]bool)
	for i := range items {
		for _, p := range items[i].Users.Items {
			if p.PayerId <= 0 || seen[p.PayerId] {
				continue
			}
			seen[p.PayerId] = true
			payerIds = append(payerIds, p.PayerId)
		}
	}
	if len(payerIds) == 0 {
		return nil
	}

	profiles, err := model.LoadChannelUsagePayerProfiles(payerIds)
	if err != nil {
		return err
	}
	// 预付且无生效订阅的付款主体才估算日均；授信客户看授信额度、订阅用户钱包不是唯一资金来源
	runwayUserIds := make([]int, 0, len(payerIds))
	for _, id := range payerIds {
		profile := profiles[id]
		if profile == nil || profile.HasSubscription || profile.BillingMode == model.EnterpriseBillingModeCredit {
			continue
		}
		runwayUserIds = append(runwayUserIds, id)
	}
	avgDaily, err := loadChannelBreakdownAvgDailyConsume(runwayUserIds)
	if err != nil {
		return err
	}

	for i := range items {
		for j := range items[i].Users.Items {
			p := &items[i].Users.Items[j]
			if p.PayerId <= 0 {
				continue
			}
			profile := profiles[p.PayerId]
			if profile == nil {
				p.Username = fmt.Sprintf("#%d", p.PayerId)
				continue
			}
			p.Username = profile.Username
			p.Group = profile.Group
			p.Status = profile.Status
			p.RemainQuota = profile.RemainQuota
			p.IsEnterprise = profile.IsEnterprise
			p.EnterpriseName = profile.EnterpriseName
			p.BillingMode = profile.BillingMode
			p.CreditPeriod = profile.CreditPeriod
			p.HasSubscription = profile.HasSubscription
			p.AvgDailyConsume = avgDaily[p.PayerId]
		}
	}
	return nil
}

// loadChannelBreakdownAvgDailyConsume 近 7 个完结自然日（计费时区）的 logs 净消耗 / 7。
// 固定除以窗口天数：缺少消费的天按 0 计，口径简单可解释；只做提示不做判定。
func loadChannelBreakdownAvgDailyConsume(userIds []int) (map[int]int64, error) {
	out := make(map[int]int64)
	if len(userIds) == 0 {
		return out, nil
	}
	today := model.ChannelUsageDayStart(common.GetTimestamp())
	net, err := model.SumLogNetQuotaByUsers(userIds, today-channelBreakdownRunwayDays*86400, today)
	if err != nil {
		return nil, err
	}
	for id, sum := range net {
		if sum > 0 {
			out[id] = sum / channelBreakdownRunwayDays
		}
	}
	return out, nil
}
