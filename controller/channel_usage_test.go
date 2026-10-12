package controller

import (
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseChannelBreakdownIds(t *testing.T) {
	ids, err := parseChannelBreakdownIds(" 7, 8,7,,20493 ")
	require.NoError(t, err)
	assert.Equal(t, []int{7, 8, 20493}, ids, "去重保序")
	for _, bad := range []string{"", " , ", "7,abc", "0", "-3"} {
		_, err := parseChannelBreakdownIds(bad)
		assert.Error(t, err, "parseChannelBreakdownIds(%q)", bad)
	}
	many := make([]string, 0, channelBreakdownMaxChannels+1)
	for i := 1; i <= channelBreakdownMaxChannels+1; i++ {
		many = append(many, strconv.Itoa(i))
	}
	_, err = parseChannelBreakdownIds(strings.Join(many, ","))
	assert.Error(t, err, "超过 %d 个渠道应报错", channelBreakdownMaxChannels)
}

func TestSortChannelUsageItems(t *testing.T) {
	items := []channelUsageItem{
		{ID: 1, Name: "b", TotalQuota: 1000, TotalOfficialQuota: 5000, RangeQuota: 100, RangeOfficialQuota: 500, MonthOfficialQuota: 50, TotalCallCount: 50},
		{ID: 2, Name: "a", TotalQuota: 5000, TotalOfficialQuota: 25000, RangeQuota: 500, RangeOfficialQuota: 2500, MonthOfficialQuota: 250, TotalCallCount: 30},
		{ID: 3, Name: "c", TotalQuota: 2000, TotalOfficialQuota: 10000, RangeQuota: 50, RangeOfficialQuota: 250, MonthOfficialQuota: 25, TotalCallCount: 100},
	}
	cases := []struct {
		sortKey string
		order   string
		wantIDs []int
	}{
		{"range_official_quota", "desc", []int{2, 1, 3}},
		{"range_official_quota", "asc", []int{3, 1, 2}},
		{"total_official_quota", "desc", []int{2, 3, 1}},
		{"total_quota", "desc", []int{2, 3, 1}},
		{"range_quota", "desc", []int{2, 1, 3}},
		{"month_official_quota", "desc", []int{2, 1, 3}},
		{"total_call_count", "desc", []int{3, 1, 2}},
		{"name", "asc", []int{2, 1, 3}},
		// 未知 key → 回落到 range_official_quota
		{"unknown", "desc", []int{2, 1, 3}},
	}
	for _, c := range cases {
		sorted := make([]channelUsageItem, len(items))
		copy(sorted, items)
		sortChannelUsageItems(sorted, c.sortKey, c.order)
		got := []int{sorted[0].ID, sorted[1].ID, sorted[2].ID}
		assert.Equal(t, c.wantIDs, got, "sort %s/%s", c.sortKey, c.order)
	}
}

func TestComputeChannelUsageSummary(t *testing.T) {
	items := []channelUsageItem{
		{
			TotalQuota: 1000, TotalOfficialQuota: 5000, TotalCallCount: 5, TotalPromptTokens: 200, TotalCompletionTokens: 100,
			RangeQuota: 100, RangeOfficialQuota: 500, RangeCallCount: 1, RangePromptTokens: 20, RangeCompletionTokens: 10,
			MonthQuota: 50, MonthOfficialQuota: 250, MonthCallCount: 1, MonthPromptTokens: 10, MonthCompletionTokens: 5,
		},
		{
			TotalQuota: 2000, TotalOfficialQuota: 10000, TotalCallCount: 10, TotalPromptTokens: 400, TotalCompletionTokens: 200,
			RangeQuota: 200, RangeOfficialQuota: 1000, RangeCallCount: 2, RangePromptTokens: 40, RangeCompletionTokens: 20,
			MonthQuota: 100, MonthOfficialQuota: 500, MonthCallCount: 2, MonthPromptTokens: 20, MonthCompletionTokens: 10,
		},
	}
	s := computeChannelUsageSummary(items, 1000, 1500, 2000)
	assert.Equal(t, channelUsageSummary{
		TotalQuota: 3000, TotalOfficialQuota: 15000, TotalCallCount: 15, TotalPromptTokens: 600, TotalCompletionTokens: 300,
		RangeQuota: 300, RangeOfficialQuota: 1500, RangeCallCount: 3, RangePromptTokens: 60, RangeCompletionTokens: 30,
		MonthQuota: 150, MonthOfficialQuota: 750, MonthCallCount: 3, MonthPromptTokens: 30, MonthCompletionTokens: 15,
		RangeStartTs: 1000, RangeEndTs: 1500, MonthStartTs: 2000,
	}, s)
}
