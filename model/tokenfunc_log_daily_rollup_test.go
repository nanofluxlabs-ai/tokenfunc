package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 种子：三天（03-10 / 03-11 / 03-12）、两个用户、两个模型，每天都有消费与退款
func seedLogRollupLogs(t *testing.T) (alice *User, bob *User) {
	t.Helper()
	alice = createEnterpriseTestUser(t, "alice", common.RoleCommonUser)
	bob = createEnterpriseTestUser(t, "bob", common.RoleCommonUser)
	for dayOffset := range 3 {
		base := financeTestDay.AddDate(0, 0, dayOffset)
		at := func(hour int) int64 { return base.Add(hourDuration(hour)).Unix() }
		insertFinanceLog(t, Log{UserId: alice.Id, Username: "alice", ModelName: "gpt-4o", Group: "default", Quota: 1000 * (dayOffset + 1), PromptTokens: 100, CompletionTokens: 50, CreatedAt: at(9)})
		insertFinanceLog(t, Log{UserId: alice.Id, Username: "alice", ModelName: "claude-3", Group: "vip", Quota: 300, PromptTokens: 30, CompletionTokens: 20, CreatedAt: at(14)})
		insertFinanceLog(t, Log{UserId: alice.Id, Username: "alice", ModelName: "gpt-4o", Group: "default", Type: LogTypeRefund, Quota: 100, CreatedAt: at(15)})
		insertFinanceLog(t, Log{UserId: bob.Id, Username: "bob", ModelName: "gpt-4o", Group: "default", Quota: 500, PromptTokens: 10, CompletionTokens: 5, CreatedAt: at(11)})
		// 非消费类日志不进入预聚合
		insertFinanceLog(t, Log{UserId: bob.Id, Username: "bob", Type: LogTypeTopup, Quota: 99999, CreatedAt: at(12)})
	}
	return alice, bob
}

func hourDuration(hour int) time.Duration { return time.Duration(hour) * time.Hour }

func foldByUser(rows []LogDailyUsageRow) map[int]*LogUsageTotals {
	return FoldLogDailyUsage(rows, func(r LogDailyUsageRow) int { return r.UserId })
}

func TestLogDailyRollupReadSegments(t *testing.T) {
	setupFinancePostgres(t)
	alice, bob := seedLogRollupLogs(t)
	fullRange, err := ParseFinanceDayRange("2026-03-10", "2026-03-12")
	require.NoError(t, err)

	// 没有游标：全部实时
	realtime, err := ReadLogDailyUsage(nil, fullRange)
	require.NoError(t, err)
	realtimeByUser := foldByUser(realtime)
	require.Len(t, realtimeByUser, 2)
	assert.Equal(t, int64(1000+2000+3000+300*3-100*3), realtimeByUser[alice.Id].NetQuota)
	assert.Equal(t, int64(6), realtimeByUser[alice.Id].Calls)
	assert.Equal(t, int64((100+30)*3), realtimeByUser[alice.Id].PromptTokens)
	assert.Equal(t, int64(500*3), realtimeByUser[bob.Id].NetQuota)

	// rollup 前两天并推进游标，再删掉第一天的原始日志：三段读取结果必须与删前全实时一致
	for _, day := range []string{"2026-03-10", "2026-03-11"} {
		rows, err := RollupLogDay(day)
		require.NoError(t, err)
		assert.Equal(t, 4, rows, day) // alice gpt-4o 消费 / alice claude-3 消费 / alice gpt-4o 退款 / bob gpt-4o 消费
	}
	require.NoError(t, SetLogRollupCursor("2026-03-11"))
	require.NoError(t, LOG_DB.Where("created_at < ?", financeTestDay.AddDate(0, 0, 1).Unix()).Delete(&Log{}).Error)

	mixed, err := ReadLogDailyUsage(nil, fullRange)
	require.NoError(t, err)
	assert.Equal(t, realtimeByUser, foldByUser(mixed))
	byDay := FoldLogDailyUsage(mixed, func(r LogDailyUsageRow) string { return r.Day })
	assert.Equal(t, int64(1000+300-100+500), byDay["2026-03-10"].NetQuota)
	assert.Equal(t, int64(3000+300-100+500), byDay["2026-03-12"].NetQuota)
	byModel := FoldLogDailyUsage(mixed, func(r LogDailyUsageRow) string { return r.ModelName })
	assert.Equal(t, int64(300*3), byModel["claude-3"].NetQuota)
	assert.Equal(t, int64(6000+1500-300), byModel["gpt-4o"].NetQuota)

	// 只查部分用户
	onlyBob, err := ReadLogDailyUsage([]int{bob.Id}, fullRange)
	require.NoError(t, err)
	assert.Equal(t, map[int]*LogUsageTotals{bob.Id: realtimeByUser[bob.Id]}, foldByUser(onlyBob))
	empty, err := ReadLogDailyUsage([]int{}, fullRange)
	require.NoError(t, err)
	assert.Empty(t, empty)

	// 区间两端不满一天：头部 [03-10 10:00, 03-11 00:00) 走实时（原始日志已删 → 只剩 alice 14 点与 15 点之外的… 实际为 0），
	// 中间 03-11 读预聚合，尾部 [03-12 00:00, 03-12 12:00) 走实时只含 9 点与 11 点两条
	partial, err := FinanceRangeFromTimestamps(financeTestDay.Add(hourDuration(10)).Unix(), financeTestDay.AddDate(0, 0, 2).Add(hourDuration(12)).Unix()-1)
	require.NoError(t, err)
	partialRows, err := ReadLogDailyUsage(nil, partial)
	require.NoError(t, err)
	partialByDay := FoldLogDailyUsage(partialRows, func(r LogDailyUsageRow) string { return r.Day })
	assert.Nil(t, partialByDay["2026-03-10"])
	assert.Equal(t, int64(2000+300-100+500), partialByDay["2026-03-11"].NetQuota)
	assert.Equal(t, int64(3000+500), partialByDay["2026-03-12"].NetQuota)
	assert.Equal(t, int64(2), partialByDay["2026-03-12"].Calls)
}

func TestLogDailyRollupCursorDecidesSource(t *testing.T) {
	setupFinancePostgres(t)
	alice, _ := seedLogRollupLogs(t)
	r, err := ParseFinanceDayRange("2026-03-11", "2026-03-11")
	require.NoError(t, err)
	rows, err := RollupLogDay("2026-03-11")
	require.NoError(t, err)
	require.Equal(t, 4, rows)
	// 重跑幂等：行数不翻倍
	rows, err = RollupLogDay("2026-03-11")
	require.NoError(t, err)
	require.Equal(t, 4, rows)
	var count int64
	require.NoError(t, DB.Model(&LogDailyRollup{}).Where("day = ?", "2026-03-11").Count(&count).Error)
	assert.Equal(t, int64(4), count)

	// 把预聚合里 alice 的 gpt-4o 消费改成一个明显不同的值，用来区分读的是表还是 logs
	require.NoError(t, DB.Model(&LogDailyRollup{}).Where("day = ? AND user_id = ? AND model_name = ? AND log_type = ?", "2026-03-11", alice.Id, "gpt-4o", LogTypeConsume).Update("quota", 777777).Error)

	// 游标在前一天：03-11 仍走实时
	require.NoError(t, SetLogRollupCursor("2026-03-10"))
	fromLogs, err := ReadLogDailyUsage([]int{alice.Id}, r)
	require.NoError(t, err)
	assert.Equal(t, int64(2000+300-100), foldByUser(fromLogs)[alice.Id].NetQuota)

	// 游标推进到 03-11：读表
	require.NoError(t, SetLogRollupCursor("2026-03-11"))
	fromTable, err := ReadLogDailyUsage([]int{alice.Id}, r)
	require.NoError(t, err)
	assert.Equal(t, int64(777777+300-100), foldByUser(fromTable)[alice.Id].NetQuota)

	cursor, err := GetLogRollupCursor()
	require.NoError(t, err)
	assert.Equal(t, "2026-03-11", cursor)
	oldest, err := OldestLogDay()
	require.NoError(t, err)
	assert.Equal(t, "2026-03-10", oldest)
}

// 与财务中心用户消耗对账：同一份日志，净额 / 次数 / token 必须一致
func TestLogDailyRollupMatchesFinanceUserConsumptions(t *testing.T) {
	setupFinancePostgres(t)
	seedLogRollupLogs(t)
	r, err := ParseFinanceDayRange("2026-03-10", "2026-03-12")
	require.NoError(t, err)
	for _, day := range []string{"2026-03-10", "2026-03-11", "2026-03-12"} {
		_, err := RollupLogDay(day)
		require.NoError(t, err)
	}
	require.NoError(t, SetLogRollupCursor("2026-03-12"))
	rows, err := ReadLogDailyUsage(nil, r)
	require.NoError(t, err)
	folded := foldByUser(rows)

	items, total, err := ListFinanceUserConsumptions(FinanceUserConsumptionFilter{Range: r}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(2), total)
	for _, item := range items {
		totals := folded[item.UserId]
		require.NotNil(t, totals, item.Username)
		assert.Equal(t, item.NetQuota, totals.NetQuota, item.Username)
		assert.Equal(t, item.ConsumeQuota, totals.ConsumeQuota, item.Username)
		assert.Equal(t, item.RefundQuota, totals.RefundQuota, item.Username)
		assert.Equal(t, item.ConsumeCount, totals.Calls, item.Username)
		assert.Equal(t, item.PromptTokens, totals.PromptTokens, item.Username)
		assert.Equal(t, item.CompletionTokens, totals.CompletionTokens, item.Username)
		assert.Equal(t, item.TotalTokens, totals.TotalTokens(), item.Username)
	}
}
