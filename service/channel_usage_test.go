package service

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 渠道消耗统计只支持 PostgreSQL，测试跑在真实 PG 上；主库与日志库共用同一连接（回填从 logs 读）
func setupChannelUsagePostgres(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	tables := []any{
		&model.User{}, &model.Token{}, &model.Log{}, &model.Channel{}, &model.Option{},
		&model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseCreditPeriod{}, &model.EnterpriseCreditNotifyRecord{}, &model.EnterpriseLedgerEntry{},
		&model.SubscriptionPlan{}, &model.UserSubscription{},
		&model.ChannelHourlyUsage{}, &model.ChannelDailyDimUsage{}, &model.ChannelUsageTotal{},
	}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
}

var channelUsageTestDay = time.Date(2026, 3, 12, 0, 0, 0, 0, time.FixedZone("CST", 8*3600)).Unix()

func newChannelUsageTestUser(t *testing.T, username string, quota int) *model.User {
	t.Helper()
	user := &model.User{Username: username, Password: "password123", DisplayName: username, Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Quota: quota, AffCode: username}
	require.NoError(t, model.DB.Create(user).Error)
	return user
}

func payerOrder(items []ChannelBreakdownPayer) []int {
	out := make([]int, 0, len(items))
	for _, p := range items {
		out = append(out, p.PayerId)
	}
	return out
}

func modelOrder(items []ChannelBreakdownModel) []string {
	out := make([]string, 0, len(items))
	for _, m := range items {
		out = append(out, m.ModelName)
	}
	return out
}

func findPayer(t *testing.T, items []ChannelBreakdownPayer, payerId int) ChannelBreakdownPayer {
	t.Helper()
	for _, p := range items {
		if p.PayerId == payerId {
			return p
		}
	}
	t.Fatalf("payer %d not found in %+v", payerId, items)
	return ChannelBreakdownPayer{}
}

func TestGetChannelUsageBreakdown(t *testing.T) {
	setupChannelUsagePostgres(t)
	owner := newChannelUsageTestUser(t, "acme_owner", 9000)
	solo := newChannelUsageTestUser(t, "solo_user", 5000)
	credit := newChannelUsageTestUser(t, "credit_owner", 10)
	subscribed := newChannelUsageTestUser(t, "subscribed", 800)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", solo.Id).Update("group", "vip").Error)
	require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: "Acme Inc"}))
	require.NoError(t, model.UpgradeUserToEnterprise(credit.Id, &model.Enterprise{Name: "Credit Co"}))
	creditEnterprise := mustEnterprise(t, credit.Id)
	require.NoError(t, model.ConfigureEnterpriseCredit(creditEnterprise.Id, model.EnterpriseCreditConfig{CycleType: model.EnterpriseCreditCycleNaturalMonth, LimitQuota: 100000}, 1))
	period, err := model.EnsureOpenCreditPeriod(creditEnterprise.Id)
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(&model.EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Update("used_quota", 20000).Error)
	plan := &model.SubscriptionPlan{Title: "Pro", DurationUnit: model.SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 1000, Enabled: true}
	require.NoError(t, model.DB.Create(plan).Error)
	now := common.GetTimestamp()
	require.NoError(t, model.DB.Create(&model.UserSubscription{UserId: subscribed.Id, PlanId: plan.Id, AmountTotal: 1000, StartTime: now - 3600, EndTime: now + 86400, Status: "active", Source: "admin"}).Error)

	// solo 近 7 天：昨天净消耗 7000-700，日均 = 6300/7 = 900；owner 也有消费但是企业预付，同样估算
	yesterday := model.ChannelUsageDayStart(now) - 86400
	for _, l := range []model.Log{
		{UserId: solo.Id, Type: model.LogTypeConsume, Quota: 7000, CreatedAt: yesterday + 10},
		{UserId: solo.Id, Type: model.LogTypeRefund, Quota: 700, CreatedAt: yesterday + 20},
		{UserId: owner.Id, Type: model.LogTypeConsume, Quota: 1400, CreatedAt: yesterday + 30},
		{UserId: subscribed.Id, Type: model.LogTypeConsume, Quota: 7000, CreatedAt: yesterday + 40},
		{UserId: credit.Id, Type: model.LogTypeConsume, Quota: 7000, CreatedAt: yesterday + 50},
	} {
		require.NoError(t, model.LOG_DB.Create(&l).Error)
	}

	day := channelUsageTestDay
	require.NoError(t, model.DB.Create(&[]model.ChannelDailyDimUsage{
		{ChannelId: 7, DayStart: day, UserId: owner.Id, ModelName: "opus", OfficialQuota: 600, Quota: 480, CallCount: 4, PromptTokens: 40, CompletionTokens: 4},
		{ChannelId: 7, DayStart: day, UserId: solo.Id, ModelName: "sonnet", OfficialQuota: 400, Quota: 500, CallCount: 4},
		{ChannelId: 7, DayStart: day, UserId: credit.Id, ModelName: "haiku", OfficialQuota: 350, Quota: 300, CallCount: 5},
		{ChannelId: 7, DayStart: day, UserId: subscribed.Id, ModelName: "sonnet", OfficialQuota: 200, Quota: 160, CallCount: 2},
		{ChannelId: 7, DayStart: day, UserId: 0, ModelName: "opus", OfficialQuota: 50, Quota: 50, CallCount: 1},
		{ChannelId: 7, DayStart: day + 86400, UserId: solo.Id, ModelName: "sonnet", OfficialQuota: 9999, Quota: 9999, CallCount: 9}, // 区间外
		{ChannelId: 8, DayStart: day, UserId: solo.Id, ModelName: "gpt-5.5", OfficialQuota: 10, Quota: 10, CallCount: 1},
	}).Error)
	base := ChannelBreakdownQuery{ChannelIds: []int{7}, StartTs: day, EndExclusive: day + 86400, Limit: 2}

	t.Run("官方价值口径排名、Top N 之外并入其余", func(t *testing.T) {
		res, err := GetChannelUsageBreakdown(base)
		require.NoError(t, err)
		assert.Equal(t, ChannelBreakdownMetricOfficial, res.Metric)
		assert.Equal(t, day, res.CoverageStartTs)
		require.Len(t, res.Items, 1)
		users := res.Items[0].Users
		assert.Equal(t, []int{owner.Id, solo.Id}, payerOrder(users.Items))
		assert.Equal(t, 5, users.Count)
		assert.Equal(t, 3, users.OthersCount)
		assert.Equal(t, int64(600), users.Others.OfficialQuota, "credit 350 + subscribed 200 + 系统 50")
		assert.Equal(t, int64(1600), users.Total.OfficialQuota)
		assert.Equal(t, int64(1490), users.Total.Quota)

		o := users.Items[0]
		assert.Equal(t, int64(600), o.OfficialQuota)
		assert.Equal(t, int64(480), o.Quota)
		assert.True(t, o.IsEnterprise)
		assert.Equal(t, "Acme Inc", o.EnterpriseName)
		assert.Equal(t, "acme_owner", o.Username)
		assert.Equal(t, model.EnterpriseBillingModePrepaid, o.BillingMode)
		assert.Nil(t, o.CreditPeriod)
		assert.Equal(t, 9000, o.RemainQuota)
		assert.Equal(t, int64(200), o.AvgDailyConsume)

		s := users.Items[1]
		assert.False(t, s.IsEnterprise)
		assert.Equal(t, "vip", s.Group)
		assert.Equal(t, 5000, s.RemainQuota)
		assert.False(t, s.HasSubscription)
		assert.Equal(t, int64(900), s.AvgDailyConsume)

		models := res.Items[0].Models
		assert.Equal(t, []string{"opus", "sonnet"}, modelOrder(models.Items))
		assert.Equal(t, int64(650), models.Items[0].OfficialQuota)
		assert.Equal(t, int64(600), models.Items[1].OfficialQuota)
		assert.Equal(t, 3, models.Count)
		assert.Equal(t, 1, models.OthersCount)
		assert.Equal(t, int64(350), models.Others.OfficialQuota)
	})

	t.Run("实际扣费口径排名随之变化，授信与订阅客户不估算日均", func(t *testing.T) {
		q := base
		q.Metric = ChannelBreakdownMetricActual
		q.Limit = 10
		res, err := GetChannelUsageBreakdown(q)
		require.NoError(t, err)
		users := res.Items[0].Users
		assert.Equal(t, []int{solo.Id, owner.Id, credit.Id, subscribed.Id, 0}, payerOrder(users.Items))
		assert.Equal(t, 0, users.OthersCount)

		c := findPayer(t, users.Items, credit.Id)
		assert.Equal(t, model.EnterpriseBillingModeCredit, c.BillingMode)
		require.NotNil(t, c.CreditPeriod)
		assert.Equal(t, int64(100000), c.CreditPeriod.LimitQuota)
		assert.Equal(t, int64(20000), c.CreditPeriod.UsedQuota)
		assert.Equal(t, int64(0), c.AvgDailyConsume)

		sub := findPayer(t, users.Items, subscribed.Id)
		assert.True(t, sub.HasSubscription)
		assert.Equal(t, int64(0), sub.AvgDailyConsume)

		sys := findPayer(t, users.Items, 0)
		assert.Equal(t, "", sys.Username)
		assert.Equal(t, []string{"sonnet", "opus", "haiku"}, modelOrder(res.Items[0].Models.Items))
	})

	t.Run("按付款主体反查模型", func(t *testing.T) {
		q := base
		q.PayerId = solo.Id
		res, err := GetChannelUsageBreakdown(q)
		require.NoError(t, err)
		models := res.Items[0].Models
		assert.Equal(t, []string{"sonnet"}, modelOrder(models.Items))
		assert.Equal(t, int64(400), models.Total.OfficialQuota)
		// 用户维度不受影响
		assert.Equal(t, int64(1600), res.Items[0].Users.Total.OfficialQuota)
	})

	t.Run("按模型反查付款主体", func(t *testing.T) {
		q := base
		q.ModelName = "sonnet"
		res, err := GetChannelUsageBreakdown(q)
		require.NoError(t, err)
		users := res.Items[0].Users
		assert.Equal(t, []int{solo.Id, subscribed.Id}, payerOrder(users.Items))
		assert.Equal(t, int64(600), users.Total.OfficialQuota)
		assert.Equal(t, int64(1600), res.Items[0].Models.Total.OfficialQuota)
	})

	t.Run("多渠道批量请求忽略交叉筛选并保持请求顺序", func(t *testing.T) {
		q := base
		q.ChannelIds = []int{8, 7, 999}
		q.ModelName = "opus"
		res, err := GetChannelUsageBreakdown(q)
		require.NoError(t, err)
		require.Len(t, res.Items, 3)
		assert.Equal(t, []int{8, 7, 999}, []int{res.Items[0].ChannelId, res.Items[1].ChannelId, res.Items[2].ChannelId})
		assert.Equal(t, int64(10), res.Items[0].Users.Total.OfficialQuota)
		assert.Equal(t, int64(1600), res.Items[1].Users.Total.OfficialQuota)
		assert.Empty(t, res.Items[2].Users.Items)
		assert.Empty(t, res.Items[2].Models.Items)
	})

	t.Run("空渠道列表直接返回", func(t *testing.T) {
		res, err := GetChannelUsageBreakdown(ChannelBreakdownQuery{})
		require.NoError(t, err)
		assert.Empty(t, res.Items)
	})
}

func TestNormalizeChannelBreakdownMetric(t *testing.T) {
	assert.Equal(t, ChannelBreakdownMetricOfficial, NormalizeChannelBreakdownMetric(""))
	assert.Equal(t, ChannelBreakdownMetricOfficial, NormalizeChannelBreakdownMetric("bogus"))
	assert.Equal(t, ChannelBreakdownMetricActual, NormalizeChannelBreakdownMetric("actual"))
}

func TestResolveChannelUsageDayRange(t *testing.T) {
	// 两端为空 = 今天（计费时区），跨度 1 天且包含当前时刻
	now := common.GetTimestamp()
	r, err := ResolveChannelUsageDayRange("", "", 366)
	require.NoError(t, err)
	assert.Equal(t, int64(86400), r.EndExcl-r.Start)
	assert.True(t, now >= r.Start && now < r.EndExcl)

	// 只给一端 → 单日；闭区间 → 上界为次日零点
	r, err = ResolveChannelUsageDayRange("2026-03-12", "", 366)
	require.NoError(t, err)
	assert.Equal(t, channelUsageTestDay, r.Start)
	assert.Equal(t, channelUsageTestDay+86400, r.EndExcl)
	r, err = ResolveChannelUsageDayRange("2026-03-12", "2026-03-14", 366)
	require.NoError(t, err)
	assert.Equal(t, channelUsageTestDay+3*86400, r.EndExcl)

	// 恰好 366 天允许，367 天拒绝；起止倒置 / 格式错误拒绝
	_, err = ResolveChannelUsageDayRange("2025-01-01", "2026-01-01", 366)
	assert.NoError(t, err)
	_, err = ResolveChannelUsageDayRange("2025-01-01", "2026-01-02", 366)
	assert.Error(t, err)
	_, err = ResolveChannelUsageDayRange("2026-03-14", "2026-03-12", 366)
	assert.Error(t, err)
	_, err = ResolveChannelUsageDayRange("2026/03/12", "", 366)
	assert.Error(t, err)
}

func TestBackfillChannelDimUsageDay(t *testing.T) {
	setupChannelUsagePostgres(t)
	day := channelUsageTestDay

	// 陈旧行应被整天替换；相邻天不受影响
	require.NoError(t, model.DB.Create(&[]model.ChannelDailyDimUsage{
		{ChannelId: 7, DayStart: day, UserId: 1, ModelName: "stale", Quota: 1, CallCount: 1},
		{ChannelId: 7, DayStart: day + 86400, UserId: 1, ModelName: "keep", Quota: 2, CallCount: 1},
	}).Error)

	logs := make([]model.Log, 0, 5010)
	// 5003 条同一秒的消费日志：跨过一批 5000 的 keyset 边界，同时考验 (created_at, id) 并列续读
	for range 5003 {
		logs = append(logs, model.Log{UserId: 11, Type: model.LogTypeConsume, ChannelId: 7, ModelName: "opus", Quota: 2, PromptTokens: 1, CompletionTokens: 1, CreatedAt: day + 100})
	}
	logs = append(logs,
		model.Log{UserId: 12, Type: model.LogTypeConsume, ChannelId: 7, ModelName: "sonnet", Quota: 100, CreatedAt: day + 200, Other: `{"group_ratio":0.5}`},
		model.Log{UserId: 0, Type: model.LogTypeConsume, ChannelId: 8, ModelName: "opus", Quota: 7, CreatedAt: day + 86399},
		model.Log{UserId: 12, Type: model.LogTypeRefund, ChannelId: 7, ModelName: "sonnet", Quota: 50, CreatedAt: day + 300},    // 退款不计
		model.Log{UserId: 12, Type: model.LogTypeConsume, ChannelId: 0, ModelName: "sonnet", Quota: 50, CreatedAt: day + 300},   // 无渠道不计
		model.Log{UserId: 12, Type: model.LogTypeConsume, ChannelId: 7, ModelName: "sonnet", Quota: 50, CreatedAt: day + 86400}, // 次日不计
		model.Log{UserId: 12, Type: model.LogTypeConsume, ChannelId: 7, ModelName: "sonnet", Quota: 50, CreatedAt: day - 1},     // 前一日不计
	)
	require.NoError(t, model.LOG_DB.CreateInBatches(&logs, 500).Error)

	scanned, rows, err := BackfillChannelDimUsageDay(context.Background(), day)
	require.NoError(t, err)
	assert.Equal(t, int64(5005), scanned)
	assert.Equal(t, 3, rows)

	var got []model.ChannelDailyDimUsage
	require.NoError(t, model.DB.Order("channel_id, day_start, user_id, model_name").Find(&got).Error)
	require.Len(t, got, 4)
	byKey := map[string]model.ChannelDailyDimUsage{}
	for _, r := range got {
		byKey[fmt.Sprintf("%s/%d/%s", r.ModelName, r.ChannelId, model.ChannelUsageDayString(r.DayStart))] = r
	}
	opus := byKey["opus/7/2026-03-12"]
	assert.Equal(t, int64(5003), opus.CallCount)
	assert.Equal(t, int64(10006), opus.Quota)
	assert.Equal(t, int64(10006), opus.OfficialQuota)
	assert.Equal(t, int64(5003), opus.PromptTokens)
	sonnet := byKey["sonnet/7/2026-03-12"]
	assert.Equal(t, int64(100), sonnet.Quota)
	assert.Equal(t, int64(200), sonnet.OfficialQuota, "quota / group_ratio 0.5")
	assert.Equal(t, int64(7), byKey["opus/8/2026-03-12"].Quota)
	assert.Equal(t, int64(2), byKey["keep/7/2026-03-13"].Quota)

	// 重跑幂等
	_, rows, err = BackfillChannelDimUsageDay(context.Background(), day)
	require.NoError(t, err)
	assert.Equal(t, 3, rows)
	var count int64
	require.NoError(t, model.DB.Model(&model.ChannelDailyDimUsage{}).Count(&count).Error)
	assert.Equal(t, int64(4), count)
}

func TestRunChannelDimUsageBackfillSkipsUnsettledDays(t *testing.T) {
	setupChannelUsagePostgres(t)
	updateChannelDimBackfillState(func(s *ChannelDimBackfillStatus) { *s = ChannelDimBackfillStatus{} })
	t.Cleanup(func() {
		updateChannelDimBackfillState(func(s *ChannelDimBackfillStatus) { *s = ChannelDimBackfillStatus{} })
	})
	today := model.ChannelUsageDayStart(common.GetTimestamp())
	start := today - 2*86400
	require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: 11, Type: model.LogTypeConsume, ChannelId: 7, ModelName: "opus", Quota: 5, CreatedAt: start + 10}).Error)

	require.NoError(t, runChannelDimUsageBackfill(context.Background(), start, today+86400))
	status := GetChannelDimBackfillStatus()
	assert.Contains(t, status.SkippedDays, model.ChannelUsageDayString(today))
	assert.GreaterOrEqual(t, status.DaysDone, 1)
	assert.Equal(t, int64(1), status.LogsScanned)

	var count int64
	require.NoError(t, model.DB.Model(&model.ChannelDailyDimUsage{}).Where("day_start = ?", start).Count(&count).Error)
	assert.Equal(t, int64(1), count)

	// 区间过长 / 倒置被拒绝，不会启动任务
	_, err := StartChannelDimUsageBackfill("2026-01-01", "2026-06-30")
	assert.Error(t, err)
	_, err = StartChannelDimUsageBackfill("2026-03-02", "2026-03-01")
	assert.Error(t, err)
}

func TestBackfillChannelUsageRebuildsHourlyAndTotalsIdempotently(t *testing.T) {
	setupChannelUsagePostgres(t)
	day := channelUsageTestDay
	// 陈旧统计必须被清掉
	require.NoError(t, model.DB.Create(&model.ChannelHourlyUsage{ChannelId: 9, HourStart: day, Quota: 1, CallCount: 1}).Error)
	require.NoError(t, model.DB.Create(&model.ChannelUsageTotal{ChannelId: 9, OfficialQuota: 1, CallCount: 1}).Error)

	logs := []model.Log{
		{UserId: 11, Type: model.LogTypeConsume, ChannelId: 7, ModelName: "opus", Quota: 1000, PromptTokens: 100, CompletionTokens: 10, CreatedAt: day + 100, Other: `{"group_ratio":0.5}`},
		{UserId: 11, Type: model.LogTypeConsume, ChannelId: 7, ModelName: "opus", Quota: 200, PromptTokens: 20, CompletionTokens: 2, CreatedAt: day + 3599},
		{UserId: 12, Type: model.LogTypeConsume, ChannelId: 7, ModelName: "opus", Quota: 300, CreatedAt: day + 3600},
		{UserId: 12, Type: model.LogTypeConsume, ChannelId: 8, ModelName: "sonnet", Quota: 50, CreatedAt: day + 40*86400}, // 跨 30 天窗口
		{UserId: 12, Type: model.LogTypeRefund, ChannelId: 7, ModelName: "opus", Quota: 300, CreatedAt: day + 3700},       // 退款不计
		{UserId: 12, Type: model.LogTypeConsume, ChannelId: 0, ModelName: "opus", Quota: 300, CreatedAt: day + 3700},      // 无渠道不计
	}
	require.NoError(t, model.LOG_DB.CreateInBatches(&logs, 100).Error)

	for round := range 2 {
		report, err := BackfillChannelUsage(context.Background())
		require.NoError(t, err, "round %d", round)
		assert.Equal(t, int64(4), report.LogsScanned)
		assert.Equal(t, 2, report.ChannelsUpdated)
		assert.Equal(t, int64(3), report.HourlyRowsUpsert)

		var hourly []model.ChannelHourlyUsage
		require.NoError(t, model.DB.Order("channel_id, hour_start").Find(&hourly).Error)
		require.Len(t, hourly, 3)
		assert.Equal(t, int64(1200), hourly[0].Quota)
		assert.Equal(t, int64(2200), hourly[0].OfficialQuota, "1000/0.5 + 200")
		assert.Equal(t, int64(2), hourly[0].CallCount)
		assert.Equal(t, int64(300), hourly[1].Quota)
		assert.Equal(t, 8, hourly[2].ChannelId)

		totals, err := model.GetChannelUsageTotals()
		require.NoError(t, err)
		require.Len(t, totals, 2)
		assert.Equal(t, int64(2500), totals[7].OfficialQuota)
		assert.Equal(t, int64(3), totals[7].CallCount)
		assert.Equal(t, int64(120), totals[7].PromptTokens)
		assert.Equal(t, int64(50), totals[8].OfficialQuota)
	}
}
