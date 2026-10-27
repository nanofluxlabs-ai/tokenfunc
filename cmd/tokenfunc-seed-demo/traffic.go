package main

import (
	"fmt"
	"math"
	"math/rand/v2"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/model"
)

// 流量生成：纯函数部分（不碰数据库），按「账号 → key → 模型」逐小时生成请求事件，
// 同一份事件同时喂给 logs 与各张派生表的聚合器，保证它们的合计天然一致。

// tokenStream 一把 key 的流量画像与归属
type tokenStream struct {
	TokenId   int
	TokenName string
	Weight    float64 // 在所属账号流量里的份额
	Mix       modelMix
	// ActiveFrom / ActiveUntil 有流量的时间窗（含头不含尾，0 表示不限）：模拟后建、停用、过期的 key
	ActiveFrom  int64
	ActiveUntil int64
	TeamId      int
	MemberId    int
}

// accountPlan 一个计费主体（个人用户或企业主账号）的流量画像
type accountPlan struct {
	UserId        int
	Username      string
	Group         string
	DailyRequests float64 // 跨度末尾、工作日的日均请求数
	PromptScale   float64 // 输入长度放大系数（编码代理类上下文更长）
	WeekendFactor float64
	StartGrowth   float64 // 跨度开头相对末尾的流量比例（<1 表示在增长）
	EnterpriseId  int
	BillingSource string // wallet / credit
	Streams       []*tokenStream
	// PeriodOf 授信企业：请求时间 → 所属账期 id；其余为 nil
	PeriodOf func(ts int64) int64
}

// requestEvent 一次模拟请求
type requestEvent struct {
	Plan             *accountPlan
	Stream           *tokenStream
	Model            *modelSpec
	ChannelId        int
	CreatedAt        int64
	PromptTokens     int
	CompletionTokens int
	CacheTokens      int
	Quota            int
	LatencyMs        int
	FrtMs            int
	IsStream         bool
	Failed           bool
}

// 上海时间各小时的流量权重：上午 10 点、下午 3 点双峰，深夜低谷
var hourWeights = [24]float64{
	0.18, 0.1, 0.06, 0.05, 0.05, 0.07, 0.15, 0.35, 0.7, 1.05, 1.3, 1.25,
	0.85, 0.95, 1.2, 1.3, 1.2, 1.0, 0.75, 0.6, 0.62, 0.55, 0.42, 0.28,
}

var hourWeightSum = func() float64 {
	sum := 0.0
	for _, w := range hourWeights {
		sum += w
	}
	return sum
}()

const failureRate = 0.02

// generateTraffic 从 start（含）到 end（不含）逐小时生成事件并交给 emit。
// 随机源按「账号 × 天」独立播种：同一 seed 下历史日完全一致，重跑时只有今天随当前时刻变化
func generateTraffic(plans []*accountPlan, channelIds map[string]int, start time.Time, end time.Time, seed uint64, emit func(requestEvent)) {
	loc := start.Location()
	// 增长曲线按整天算跨度：同一天内什么时刻重跑，历史日的期望值都不变
	span := startOfDay(end.In(loc)).AddDate(0, 0, 1).Sub(start).Hours()
	var rng *rand.Rand
	for planIdx, plan := range plans {
		mixes := make([][]weightedModel, len(plan.Streams))
		weightSum := 0.0
		for i, stream := range plan.Streams {
			mixes[i] = sortedMix(stream.Mix)
			weightSum += stream.Weight
		}
		dayNoise := 1.0
		rng = nil
		for hour := start; hour.Before(end); hour = hour.Add(time.Hour) {
			local := hour.In(loc)
			if rng == nil || local.Hour() == 0 {
				dayIndex := uint64(hour.Sub(start).Hours() / 24)
				rng = rand.New(rand.NewPCG(seed, uint64(planIdx)<<32|dayIndex))
				// 每天一个噪声系数：让日折线有起伏但不过分锯齿
				dayNoise = clamp(1+0.16*rng.NormFloat64(), 0.6, 1.5)
			}
			progress := hour.Sub(start).Hours() / span
			expected := plan.DailyRequests * (plan.StartGrowth + (1-plan.StartGrowth)*progress) * dayNoise
			if wd := local.Weekday(); wd == time.Saturday || wd == time.Sunday {
				expected *= plan.WeekendFactor
			}
			expected *= hourWeights[local.Hour()] / hourWeightSum
			for i, stream := range plan.Streams {
				hourStart := hour.Unix()
				if stream.ActiveFrom > 0 && hourStart+3600 <= stream.ActiveFrom {
					continue
				}
				if stream.ActiveUntil > 0 && hourStart >= stream.ActiveUntil {
					continue
				}
				count := poisson(rng, expected*stream.Weight/weightSum)
				for range count {
					ts := hourStart + rng.Int64N(3600)
					if ts >= end.Unix() || (stream.ActiveFrom > 0 && ts < stream.ActiveFrom) || (stream.ActiveUntil > 0 && ts >= stream.ActiveUntil) {
						continue
					}
					spec := pickModel(rng, mixes[i])
					emit(buildEvent(rng, plan, stream, spec, channelIds[spec.Channel], ts))
				}
			}
		}
	}
}

func buildEvent(rng *rand.Rand, plan *accountPlan, stream *tokenStream, spec *modelSpec, channelId int, ts int64) requestEvent {
	ev := requestEvent{Plan: plan, Stream: stream, Model: spec, ChannelId: channelId, CreatedAt: ts, IsStream: rng.Float64() < 0.72}
	ev.FrtMs = 280 + rng.IntN(1300)
	if rng.Float64() < failureRate {
		ev.Failed = true
		ev.LatencyMs = ev.FrtMs + rng.IntN(4000)
		return ev
	}
	scale := plan.PromptScale
	if scale <= 0 {
		scale = 1
	}
	ev.PromptTokens = max(16, int(float64(spec.PromptMean)*scale*logNormal(rng, 0.65)))
	ev.CompletionTokens = max(4, int(float64(spec.CompletionMean)*logNormal(rng, 0.7)))
	if spec.CacheRatio > 0 && rng.Float64() < 0.58 {
		ev.CacheTokens = int(float64(ev.PromptTokens) * (0.35 + 0.55*rng.Float64()))
	}
	ev.Quota = computeQuota(spec, ev.PromptTokens, ev.CacheTokens, ev.CompletionTokens)
	ev.LatencyMs = ev.FrtMs + int(float64(ev.CompletionTokens)/spec.OutputTPS*1000)
	return ev
}

// computeQuota prompt 含缓存（OpenAI 口径）：未命中部分按 1 倍、命中部分按缓存倍率，输出按补全倍率；分组倍率固定 1
func computeQuota(spec *modelSpec, prompt int, cache int, completion int) int {
	tokens := float64(prompt-cache) + float64(cache)*spec.CacheRatio + float64(completion)*spec.CompletionRatio
	return max(1, int(math.Round(tokens*spec.Ratio)))
}

type weightedModel struct {
	spec   *modelSpec
	weight float64
}

// sortedMix map 无序，按名字排序后再抽样，保证同一 seed 结果稳定
func sortedMix(mix modelMix) []weightedModel {
	names := make([]string, 0, len(mix))
	for name := range mix {
		names = append(names, name)
	}
	sort.Strings(names)
	out := make([]weightedModel, 0, len(names))
	for _, name := range names {
		out = append(out, weightedModel{spec: findModel(name), weight: mix[name]})
	}
	return out
}

func pickModel(rng *rand.Rand, mix []weightedModel) *modelSpec {
	total := 0.0
	for _, item := range mix {
		total += item.weight
	}
	target := rng.Float64() * total
	for _, item := range mix {
		target -= item.weight
		if target < 0 {
			return item.spec
		}
	}
	return mix[len(mix)-1].spec
}

// poisson Knuth 算法；期望很大时用正态近似
func poisson(rng *rand.Rand, lambda float64) int {
	if lambda <= 0 {
		return 0
	}
	if lambda > 30 {
		return max(0, int(math.Round(lambda+math.Sqrt(lambda)*rng.NormFloat64())))
	}
	limit, product, count := math.Exp(-lambda), rng.Float64(), 0
	for product > limit {
		product *= rng.Float64()
		count++
	}
	return count
}

// logNormal 均值约为 1 的对数正态系数
func logNormal(rng *rand.Rand, sigma float64) float64 {
	return math.Exp(sigma*rng.NormFloat64() - sigma*sigma/2)
}

func clamp(v, lo, hi float64) float64 {
	return math.Max(lo, math.Min(hi, v))
}

// ---------------------------------------------------------------------------
// 聚合：与线上写入口径一致（quota_data 按小时 8 维、ent_usage_daily 按上海日 7 维、perf_metrics 按小时）
// ---------------------------------------------------------------------------

type usageTotals struct {
	Quota        int64
	Requests     int64
	LastAccessAt int64
}

type perfKey struct {
	Model  string
	Bucket int64
}

type aggregator struct {
	loc       *time.Location
	perfSince int64
	quotaData map[string]*model.QuotaData
	entUsage  map[string]*model.EnterpriseUsageDaily
	perf      map[perfKey]*model.PerfMetric
	users     map[int]*usageTotals
	tokens    map[int]*usageTotals
	channels  map[int]int64
	periods   map[int64]int64
	// userDaily 用户 → 上海日零点 → 消耗；充值节奏、推广结算快照按它算
	userDaily   map[int]map[int64]int64
	logCount    int
	errorCount  int
	consumeSum  int64
	nowForStamp int64
}

func newAggregator(loc *time.Location, perfSince int64, now int64) *aggregator {
	return &aggregator{
		loc: loc, perfSince: perfSince, nowForStamp: now,
		quotaData: map[string]*model.QuotaData{}, entUsage: map[string]*model.EnterpriseUsageDaily{},
		perf: map[perfKey]*model.PerfMetric{}, users: map[int]*usageTotals{}, tokens: map[int]*usageTotals{},
		channels: map[int]int64{}, periods: map[int64]int64{}, userDaily: map[int]map[int64]int64{},
	}
}

func (a *aggregator) add(ev requestEvent) {
	a.logCount++
	plan, stream := ev.Plan, ev.Stream
	if ev.CreatedAt >= a.perfSince {
		bucket := ev.CreatedAt - ev.CreatedAt%3600
		key := perfKey{Model: ev.Model.Name, Bucket: bucket}
		metric := a.perf[key]
		if metric == nil {
			metric = &model.PerfMetric{ModelName: ev.Model.Name, Group: plan.Group, BucketTs: bucket}
			a.perf[key] = metric
		}
		metric.RequestCount++
		metric.TotalLatencyMs += int64(ev.LatencyMs)
		if !ev.Failed {
			metric.SuccessCount++
			metric.TtftSumMs += int64(ev.FrtMs)
			metric.TtftCount++
			metric.OutputTokens += int64(ev.CompletionTokens)
			metric.GenerationMs += int64(ev.LatencyMs - ev.FrtMs)
		}
	}
	if ev.Failed {
		a.errorCount++
		return
	}
	a.consumeSum += int64(ev.Quota)
	hour := ev.CreatedAt - ev.CreatedAt%3600
	qdKey := fmt.Sprintf("%d|%s|%d|%d|%d", plan.UserId, ev.Model.Name, hour, stream.TokenId, ev.ChannelId)
	qd := a.quotaData[qdKey]
	if qd == nil {
		qd = &model.QuotaData{UserID: plan.UserId, Username: plan.Username, ModelName: ev.Model.Name, CreatedAt: hour,
			UseGroup: plan.Group, TokenID: stream.TokenId, ChannelID: ev.ChannelId, NodeName: demoNodeName}
		a.quotaData[qdKey] = qd
	}
	qd.Count++
	qd.Quota += ev.Quota
	qd.TokenUsed += ev.PromptTokens + ev.CompletionTokens

	if plan.EnterpriseId > 0 {
		var periodId int64
		if plan.PeriodOf != nil {
			periodId = plan.PeriodOf(ev.CreatedAt)
			a.periods[periodId] += int64(ev.Quota)
		}
		day := time.Unix(ev.CreatedAt, 0).In(a.loc).Format("2006-01-02")
		euKey := fmt.Sprintf("%s|%d|%s|%d", day, stream.TokenId, ev.Model.Name, periodId)
		row := a.entUsage[euKey]
		if row == nil {
			row = &model.EnterpriseUsageDaily{Day: day, EnterpriseId: plan.EnterpriseId, TokenId: stream.TokenId, ModelName: ev.Model.Name,
				PeriodId: periodId, TeamId: stream.TeamId, MemberId: stream.MemberId, UpdatedAt: a.nowForStamp}
			a.entUsage[euKey] = row
		}
		row.RequestCount++
		row.PromptTokens += int64(ev.PromptTokens)
		row.CompletionTokens += int64(ev.CompletionTokens)
		row.CacheTokens += int64(ev.CacheTokens)
		row.Quota += int64(ev.Quota)
	}

	local := time.Unix(ev.CreatedAt, 0).In(a.loc)
	dayStart := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, a.loc).Unix()
	if a.userDaily[plan.UserId] == nil {
		a.userDaily[plan.UserId] = map[int64]int64{}
	}
	a.userDaily[plan.UserId][dayStart] += int64(ev.Quota)

	addTotals(a.users, plan.UserId, ev)
	addTotals(a.tokens, stream.TokenId, ev)
	a.channels[ev.ChannelId] += int64(ev.Quota)
}

func addTotals(m map[int]*usageTotals, id int, ev requestEvent) {
	totals := m[id]
	if totals == nil {
		totals = &usageTotals{}
		m[id] = totals
	}
	totals.Quota += int64(ev.Quota)
	totals.Requests++
	totals.LastAccessAt = max(totals.LastAccessAt, ev.CreatedAt)
}

// userQuotaBetween 用户在 [from, to) 内的消耗（按上海日粒度，from / to 应为日零点）
func (a *aggregator) userQuotaBetween(userId int, from int64, to int64) int64 {
	var sum int64
	for day, quota := range a.userDaily[userId] {
		if day >= from && day < to {
			sum += quota
		}
	}
	return sum
}
