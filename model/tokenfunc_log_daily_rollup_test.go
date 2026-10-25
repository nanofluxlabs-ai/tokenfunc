package model

import (
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 种子：三天（03-10 / 03-11 / 03-12）、两个用户、两个模型、三个渠道，每天都有消费与退款；
// other 覆盖三种拆分口径：OpenAI 语义扣缓存与音频 / Claude 语义净输入 / 订阅扣费
func seedLogRollupLogs(t *testing.T) (alice *User, bob *User) {
	t.Helper()
	alice = createEnterpriseTestUser(t, "alice", common.RoleCommonUser)
	bob = createEnterpriseTestUser(t, "bob", common.RoleCommonUser)
	for dayOffset := range 3 {
		base := financeTestDay.AddDate(0, 0, dayOffset)
		at := func(hour int) int64 { return base.Add(hourDuration(hour)).Unix() }
		insertFinanceLog(t, Log{UserId: alice.Id, Username: "alice", ModelName: "gpt-4o", Group: "default", ChannelId: 7, Quota: 1000 * (dayOffset + 1), PromptTokens: 100, CompletionTokens: 50, CreatedAt: at(9),
			Other: `{"cache_tokens":10,"audio_input":5,"audio_output":2}`})
		insertFinanceLog(t, Log{UserId: alice.Id, Username: "alice", ModelName: "claude-3", Group: "vip", ChannelId: 9, Quota: 300, PromptTokens: 30, CompletionTokens: 20, CreatedAt: at(14),
			Other: `{"usage_semantic":"anthropic","cache_tokens":3,"cache_creation_tokens_5m":4,"cache_creation_tokens_1h":1}`})
		insertFinanceLog(t, Log{UserId: alice.Id, Username: "alice", ModelName: "gpt-4o", Group: "default", ChannelId: 7, Type: LogTypeRefund, Quota: 100, CreatedAt: at(15)})
		insertFinanceLog(t, Log{UserId: bob.Id, Username: "bob", ModelName: "gpt-4o", Group: "default", ChannelId: 8, Quota: 500, PromptTokens: 10, CompletionTokens: 5, CreatedAt: at(11),
			Other: `{"text_input":9,"billing_source":"subscription","subscription_consumed":300,"wallet_quota_deducted":200}`})
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
	// 拆分列：gpt-4o 退化口径 100-5-10=85，claude-3 净输入 30 → 每天 115；输出 (50-2)+20=68；缓存读 13、缓存写 5；音频 5 / 2
	assert.Equal(t, int64(115*3), realtimeByUser[alice.Id].TextInputTokens)
	assert.Equal(t, int64(68*3), realtimeByUser[alice.Id].TextOutputTokens)
	assert.Equal(t, int64(13*3), realtimeByUser[alice.Id].CacheReadTokens)
	assert.Equal(t, int64(5*3), realtimeByUser[alice.Id].CacheWriteTokens)
	assert.Equal(t, int64(5*3), realtimeByUser[alice.Id].AudioInputTokens)
	assert.Equal(t, int64(2*3), realtimeByUser[alice.Id].AudioOutputTokens)
	assert.Equal(t, int64((1000+2000+3000)+300*3), realtimeByUser[alice.Id].WalletQuota, "非订阅请求整笔计钱包")
	assert.Equal(t, int64(0), realtimeByUser[alice.Id].SubscriptionQuota)
	assert.Equal(t, int64(9*3), realtimeByUser[bob.Id].TextInputTokens, "显式 text_input")
	assert.Equal(t, int64(300*3), realtimeByUser[bob.Id].SubscriptionQuota)
	assert.Equal(t, int64(200*3), realtimeByUser[bob.Id].WalletQuota)
	assert.Equal(t, financeTestDay.AddDate(0, 0, 2).Add(hourDuration(14)).Unix(), realtimeByUser[alice.Id].LastConsumeAt)
	realtimeByChannel := FoldLogDailyUsage(realtime, func(r LogDailyUsageRow) int { return r.ChannelId })
	assert.Equal(t, int64(6000-300), realtimeByChannel[7].NetQuota)
	assert.Equal(t, int64(1500), realtimeByChannel[8].NetQuota)
	assert.Equal(t, int64(900), realtimeByChannel[9].NetQuota)

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
	assert.Equal(t, realtimeByChannel, FoldLogDailyUsage(mixed, func(r LogDailyUsageRow) int { return r.ChannelId }))

	// 按 (分组, 模型, 渠道) 在 SQL 侧聚合（模型消费用）：跨三段仍与实时一致，模型名模糊与分组过滤作用于每一段
	byModelChannel, err := ReadLogUsageByModelChannel(nil, "", "", fullRange)
	require.NoError(t, err)
	require.Len(t, byModelChannel, 3)
	assert.Equal(t, int64(6000-300), byModelChannel[LogUsageModelChannelKey{GroupName: "default", ModelName: "gpt-4o", ChannelId: 7}].NetQuota)
	assert.Equal(t, int64(2*3), byModelChannel[LogUsageModelChannelKey{GroupName: "default", ModelName: "gpt-4o", ChannelId: 7}].AudioOutputTokens)
	assert.Equal(t, int64(1500), byModelChannel[LogUsageModelChannelKey{GroupName: "default", ModelName: "gpt-4o", ChannelId: 8}].NetQuota)
	assert.Equal(t, int64(900), byModelChannel[LogUsageModelChannelKey{GroupName: "vip", ModelName: "claude-3", ChannelId: 9}].NetQuota)
	filtered, err := ReadLogUsageByModelChannel([]int{bob.Id}, "GPT", "default", fullRange)
	require.NoError(t, err)
	require.Len(t, filtered, 1)
	assert.Equal(t, int64(1500), filtered[LogUsageModelChannelKey{GroupName: "default", ModelName: "gpt-4o", ChannelId: 8}].NetQuota)
	noGroup, err := ReadLogUsageByModelChannel(nil, "claude", "default", fullRange)
	require.NoError(t, err)
	assert.Empty(t, noGroup)

	// SQL 侧按用户 / 按天聚合（财务中心用）必须与全维度折叠一致，且同样跨三段
	byUser, err := ReadLogUsageByUser(nil, fullRange)
	require.NoError(t, err)
	assert.Equal(t, realtimeByUser, byUser)
	byDayAgg, err := ReadLogUsageByDay(nil, fullRange)
	require.NoError(t, err)
	assert.Equal(t, byDay, byDayAgg)
	bobOnlyByUser, err := ReadLogUsageByUser([]int{bob.Id}, fullRange)
	require.NoError(t, err)
	assert.Equal(t, map[int]*LogUsageTotals{bob.Id: realtimeByUser[bob.Id]}, bobOnlyByUser)

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
	assert.Equal(t, "alice", items[0].Username, "用户名来自 users 表")
	assert.Equal(t, financeTestDay.AddDate(0, 0, 2).Add(hourDuration(14)).Unix(), items[0].LastConsumeAt, "最后一条消费是 14 点的 claude-3")
	checkAgainstFolded := func(items []*FinanceUserConsumptionItem) {
		for _, item := range items {
			totals := folded[item.UserId]
			require.NotNil(t, totals, item.Username)
			assert.Equal(t, totals.NetQuota, item.NetQuota, item.Username)
			assert.Equal(t, totals.ConsumeQuota, item.ConsumeQuota, item.Username)
			assert.Equal(t, totals.RefundQuota, item.RefundQuota, item.Username)
			assert.Equal(t, totals.Calls, item.ConsumeCount, item.Username)
			assert.Equal(t, totals.PromptTokens, item.PromptTokens, item.Username)
			assert.Equal(t, totals.CompletionTokens, item.CompletionTokens, item.Username)
			assert.Equal(t, totals.TotalTokens(), item.TotalTokens, item.Username)
		}
	}
	checkAgainstFolded(items)

	// 关键词在 users 表匹配：用户名模糊 / 数字 id
	byKeyword, total, err := ListFinanceUserConsumptions(FinanceUserConsumptionFilter{Range: r, Keyword: "BOB"}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	assert.Equal(t, "bob", byKeyword[0].Username)
	byId, _, err := ListFinanceUserConsumptions(FinanceUserConsumptionFilter{Range: r, Keyword: strconv.Itoa(items[0].UserId)}, 0, 10)
	require.NoError(t, err)
	require.Len(t, byId, 1)
	assert.Equal(t, items[0].UserId, byId[0].UserId)

	// 模型消费（分组 × 模型 × 渠道）同样读预聚合；渠道名来自主库
	require.NoError(t, DB.Create(&Channel{Id: 7, Name: "主渠道", Key: "k"}).Error)
	modelItems, modelSummary, err := ListFinanceModelConsumptions(FinanceModelConsumptionFilter{Range: r})
	require.NoError(t, err)
	require.Len(t, modelItems, 3)
	assert.Equal(t, 7, modelItems[0].ChannelId, "按净额倒序，alice 的 gpt-4o 渠道 7 最大")
	assert.Equal(t, "主渠道", modelItems[0].ChannelName)
	assert.Equal(t, int64(6000-300), modelItems[0].NetQuota)
	assert.Equal(t, folded[items[0].UserId].NetQuota+folded[items[1].UserId].NetQuota, modelSummary.NetQuota)
	assert.Equal(t, 3, modelSummary.RowCount)
	byUsername, _, err := ListFinanceModelConsumptions(FinanceModelConsumptionFilter{Range: r, Username: "BOB", ModelName: "gpt"})
	require.NoError(t, err)
	require.Len(t, byUsername, 1, "用户名在 users 表匹配，不区分大小写")
	assert.Equal(t, 8, byUsername[0].ChannelId)
	noUser, _, err := ListFinanceModelConsumptions(FinanceModelConsumptionFilter{Range: r, Username: "nobody"})
	require.NoError(t, err)
	assert.Empty(t, noUser)

	// 原始日志归档删除后（PR-3），用户消耗全部列（含拆分列、最后消耗时间）与模型消费都仍由预聚合给出
	require.NoError(t, LOG_DB.Where("created_at < ?", financeTestDay.AddDate(0, 0, 2).Unix()).Delete(&Log{}).Error)
	afterArchive, total, err := ListFinanceUserConsumptions(FinanceUserConsumptionFilter{Range: r}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(2), total)
	checkAgainstFolded(afterArchive)
	for i := range items {
		assert.Equal(t, items[i].TextInputTokens, afterArchive[i].TextInputTokens, items[i].Username)
		assert.Equal(t, items[i].TextOutputTokens, afterArchive[i].TextOutputTokens, items[i].Username)
		assert.Equal(t, items[i].CacheReadTokens, afterArchive[i].CacheReadTokens, items[i].Username)
		assert.Equal(t, items[i].CacheWriteTokens, afterArchive[i].CacheWriteTokens, items[i].Username)
		assert.Equal(t, items[i].AudioInputTokens, afterArchive[i].AudioInputTokens, items[i].Username)
		assert.Equal(t, items[i].WalletConsumeQuota, afterArchive[i].WalletConsumeQuota, items[i].Username)
		assert.Equal(t, items[i].SubscriptionConsumeQuota, afterArchive[i].SubscriptionConsumeQuota, items[i].Username)
		assert.Equal(t, items[i].LastConsumeAt, afterArchive[i].LastConsumeAt, items[i].Username)
	}
	assert.Equal(t, int64(115*3), afterArchive[0].TextInputTokens)
	modelAfter, _, err := ListFinanceModelConsumptions(FinanceModelConsumptionFilter{Range: r})
	require.NoError(t, err)
	assert.Equal(t, modelItems, modelAfter)
}

// v1 → v2 一次性迁移：清掉可重建的行、游标归零；已 purge 的天保留且游标停在那里；重复调用幂等
func TestMigrateLogDailyRollupV2(t *testing.T) {
	setupFinancePostgres(t)
	seedLogRollupLogs(t)
	for _, day := range []string{"2026-03-10", "2026-03-11", "2026-03-12"} {
		_, err := RollupLogDay(day)
		require.NoError(t, err)
	}
	require.NoError(t, SetLogRollupCursor("2026-03-12"))
	require.NoError(t, SetLogRollupYesterdayDone("2026-03-12"))
	countRows := func() int64 {
		var count int64
		require.NoError(t, DB.Model(&LogDailyRollup{}).Count(&count).Error)
		return count
	}
	require.Equal(t, int64(12), countRows())

	// 没有 purge 记录：全清、游标与昨天标记删除、版本写入
	require.NoError(t, MigrateLogDailyRollupV2())
	assert.Equal(t, int64(0), countRows())
	cursor, err := GetLogRollupCursor()
	require.NoError(t, err)
	assert.Equal(t, "", cursor)
	yesterday, err := GetLogRollupYesterdayDone()
	require.NoError(t, err)
	assert.Equal(t, "", yesterday)
	version, err := GetTokenfuncOption(LogRollupSchemaOptionKey)
	require.NoError(t, err)
	assert.Equal(t, LogRollupSchemaVersion, version)

	// 已是当前版本：重建后再调用不再清表
	_, err = RollupLogDay("2026-03-10")
	require.NoError(t, err)
	require.NoError(t, SetLogRollupCursor("2026-03-10"))
	require.NoError(t, MigrateLogDailyRollupV2())
	assert.Equal(t, int64(4), countRows())
	cursor, err = GetLogRollupCursor()
	require.NoError(t, err)
	assert.Equal(t, "2026-03-10", cursor)

	// 版本回退模拟 + 03-10 已 purge：03-10 的行保留，之后的清掉，游标停在 03-10
	for _, day := range []string{"2026-03-11", "2026-03-12"} {
		_, err := RollupLogDay(day)
		require.NoError(t, err)
	}
	require.NoError(t, SetLogRollupCursor("2026-03-12"))
	require.NoError(t, DB.Where(&Option{Key: LogRollupSchemaOptionKey}).Delete(&Option{}).Error)
	require.NoError(t, DB.Create(&LogArchiveManifest{Day: "2026-03-10", Status: LogArchiveStatusPurged}).Error)
	require.NoError(t, MigrateLogDailyRollupV2())
	assert.Equal(t, int64(4), countRows())
	var keptDays []string
	require.NoError(t, DB.Model(&LogDailyRollup{}).Distinct("day").Pluck("day", &keptDays).Error)
	assert.Equal(t, []string{"2026-03-10"}, keptDays)
	cursor, err = GetLogRollupCursor()
	require.NoError(t, err)
	assert.Equal(t, "2026-03-10", cursor)
}
