package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testPlans(periodSplit int64) []*accountPlan {
	personal := &accountPlan{UserId: 1, Username: "demo_p", Group: "default", DailyRequests: 120, PromptScale: 1, WeekendFactor: 0.5,
		StartGrowth: 0.6, BillingSource: "wallet", Streams: []*tokenStream{
			{TokenId: 11, TokenName: "a", Weight: 3, Mix: mixCoding},
			{TokenId: 12, TokenName: "b", Weight: 1, Mix: mixLight},
		}}
	enterprise := &accountPlan{UserId: 2, Username: "demo_e", Group: "default", DailyRequests: 300, PromptScale: 2, WeekendFactor: 0.3,
		StartGrowth: 0.5, EnterpriseId: 7, BillingSource: "credit", Streams: []*tokenStream{
			{TokenId: 21, TokenName: "m1", Weight: 2, Mix: mixMixed, TeamId: 3, MemberId: 5},
			{TokenId: 22, TokenName: "team", Weight: 1, Mix: mixApp, TeamId: 4},
		},
		PeriodOf: func(ts int64) int64 {
			if ts < periodSplit {
				return 100
			}
			return 101
		}}
	return []*accountPlan{personal, enterprise}
}

var testChannels = map[string]int{"openai": 1, "anthropic": 2, "multi": 3}

// 同一 seed 下历史日的流量完全一致；终点往后挪只影响最后一天
func TestGenerateTrafficDeterministic(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, loc)
	collect := func(end time.Time) []requestEvent {
		var events []requestEvent
		generateTraffic(testPlans(0), testChannels, start, end, 42, func(ev requestEvent) {
			if ev.CreatedAt < start.AddDate(0, 0, 3).Unix() {
				events = append(events, ev)
			}
		})
		return events
	}
	first := collect(start.AddDate(0, 0, 4).Add(5 * time.Hour))
	second := collect(start.AddDate(0, 0, 4).Add(9*time.Hour + 17*time.Minute))
	require.NotEmpty(t, first)
	require.Len(t, second, len(first))
	for i := range first {
		assert.Equal(t, first[i].CreatedAt, second[i].CreatedAt)
		assert.Equal(t, first[i].Quota, second[i].Quota)
		assert.Equal(t, first[i].Model.Name, second[i].Model.Name)
	}
}

// 派生表的合计必须等于流水：quota_data = 全部成功请求，ent_usage_daily = 企业成功请求 = 各账期合计，失败请求不计费
func TestAggregatorConservesUsage(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, loc)
	end := start.AddDate(0, 0, 10)
	split := start.AddDate(0, 0, 6).Unix()
	agg := newAggregator(loc, start.Unix(), end.Unix())
	var consumed, enterpriseConsumed int64
	var success, failed int
	streamWindowViolations := 0
	generateTraffic(testPlans(split), testChannels, start, end, 7, func(ev requestEvent) {
		agg.add(ev)
		if ev.CreatedAt < start.Unix() || ev.CreatedAt >= end.Unix() {
			streamWindowViolations++
		}
		if ev.Failed {
			failed++
			assert.Zero(t, ev.Quota)
			return
		}
		success++
		consumed += int64(ev.Quota)
		if ev.Plan.EnterpriseId > 0 {
			enterpriseConsumed += int64(ev.Quota)
		}
	})
	require.Positive(t, success)
	require.Positive(t, failed, "a 2%% failure rate over ten days should produce errors")
	assert.Zero(t, streamWindowViolations)

	var quotaDataSum, quotaDataCount int64
	for _, row := range agg.quotaData {
		quotaDataSum += int64(row.Quota)
		quotaDataCount += int64(row.Count)
		assert.Equal(t, int64(0), row.CreatedAt%3600, "quota_data is bucketed by hour")
		assert.NotEmpty(t, row.UseGroup, "flow endpoints drop rows without a group")
	}
	assert.Equal(t, consumed, quotaDataSum)
	assert.Equal(t, int64(success), quotaDataCount)

	var usageSum int64
	for _, row := range agg.entUsage {
		usageSum += row.Quota
		assert.Equal(t, 7, row.EnterpriseId)
	}
	assert.Equal(t, enterpriseConsumed, usageSum)
	assert.Equal(t, enterpriseConsumed, agg.periods[100]+agg.periods[101])
	assert.Positive(t, agg.periods[100])
	assert.Positive(t, agg.periods[101])

	var userSum int64
	for _, totals := range agg.users {
		userSum += totals.Quota
	}
	assert.Equal(t, consumed, userSum)
	assert.Equal(t, consumed, agg.userQuotaBetween(1, 0, end.Unix())+agg.userQuotaBetween(2, 0, end.Unix()))

	var perfRequests int64
	for _, metric := range agg.perf {
		perfRequests += metric.RequestCount
	}
	assert.Equal(t, int64(success+failed), perfRequests)
}

// 时间窗外的 key 不出流量（停用 / 过期 / 晚建）
func TestStreamActiveWindow(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, loc)
	end := start.AddDate(0, 0, 6)
	from, until := start.AddDate(0, 0, 2).Unix()+1800, start.AddDate(0, 0, 4).Unix()
	plan := &accountPlan{UserId: 1, Username: "demo_w", Group: "default", DailyRequests: 400, WeekendFactor: 1, StartGrowth: 1,
		Streams: []*tokenStream{{TokenId: 1, Weight: 1, Mix: mixLight, ActiveFrom: from, ActiveUntil: until}}}
	count := 0
	generateTraffic([]*accountPlan{plan}, testChannels, start, end, 3, func(ev requestEvent) {
		count++
		assert.GreaterOrEqual(t, ev.CreatedAt, from)
		assert.Less(t, ev.CreatedAt, until)
	})
	assert.Positive(t, count)
}

func TestCheckTargetDSN(t *testing.T) {
	cases := map[string]bool{
		"postgresql://u:p@127.0.0.1:55432/tokenfunc?search_path=dev":                     true,
		"postgresql://u:p@localhost:55432/tokenfunc?search_path=dev_feat_seed_demo_data": true,
		"postgresql://u:p@127.0.0.1:55432/tokenfunc?search_path=public":                  false,
		"postgresql://u:p@127.0.0.1:55432/tokenfunc?search_path=test":                    false,
		"postgresql://u:p@db.example.com:5432/tokenfunc?search_path=dev":                 false,
		"mysql://u:p@127.0.0.1:3306/tokenfunc":                                           false,
		"":                                                                               false,
	}
	for dsn, ok := range cases {
		err := checkTargetDSN(dsn)
		if ok {
			assert.NoError(t, err, dsn)
		} else {
			assert.Error(t, err, dsn)
		}
	}
}
