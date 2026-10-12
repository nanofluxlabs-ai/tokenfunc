package model

import (
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 渠道消耗统计只支持 PostgreSQL（ON CONFLICT ... excluded），测试跑在真实 PG 上；主库与日志库共用同一连接
func setupChannelUsagePostgres(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)

	previousDB, previousLogDB := DB, LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousBatch := common.ChannelUsageBatchEnabled
	DB, LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	initCol()
	resetChannelUsageCache()
	t.Cleanup(func() {
		resetChannelUsageCache()
		require.NoError(t, db.Migrator().DropTable(channelUsageTestTables...))
		require.NoError(t, sqlDB.Close())
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.ChannelUsageBatchEnabled = previousBatch
		initCol()
	})
	require.NoError(t, db.Migrator().DropTable(channelUsageTestTables...))
	require.NoError(t, db.AutoMigrate(channelUsageTestTables...))
	return db
}

var channelUsageTestTables = []any{
	&User{}, &Log{}, &Channel{}, &Enterprise{}, &EnterpriseCreditPeriod{}, &EnterpriseLedgerEntry{},
	&SubscriptionPlan{}, &UserSubscription{}, &ChannelHourlyUsage{}, &ChannelDailyDimUsage{}, &ChannelUsageTotal{},
}

// resetChannelUsageCache 清空内存聚合缓存，保证用例间隔离
func resetChannelUsageCache() {
	channelUsageCacheLock.Lock()
	channelUsageCache = make(map[chanHourKey]*channelUsageDelta)
	channelDimUsageCache = make(map[chanDimKey]*channelUsageDelta)
	channelUsageCacheLock.Unlock()
}

func loadHourlyRows(t *testing.T) map[chanHourKey]ChannelHourlyUsage {
	t.Helper()
	var rows []ChannelHourlyUsage
	require.NoError(t, DB.Find(&rows).Error)
	out := make(map[chanHourKey]ChannelHourlyUsage, len(rows))
	for _, r := range rows {
		out[chanHourKey{channelId: r.ChannelId, hourStart: r.HourStart}] = r
	}
	return out
}

func loadDimRows(t *testing.T) map[chanDimKey]ChannelDailyDimUsage {
	t.Helper()
	var rows []ChannelDailyDimUsage
	require.NoError(t, DB.Find(&rows).Error)
	out := make(map[chanDimKey]ChannelDailyDimUsage, len(rows))
	for _, r := range rows {
		out[chanDimKey{channelId: r.ChannelId, dayStart: r.DayStart, userId: r.UserId, modelName: r.ModelName}] = r
	}
	return out
}

// 固定的测试日（上海时区 2026-03-10 00:00），与财务中心测试同一基准
var channelUsageTestDay = time.Date(2026, 3, 10, 0, 0, 0, 0, enterpriseBillingLocation).Unix()

func TestChannelUsageOfficialQuotaAndDayBoundaries(t *testing.T) {
	assert.Equal(t, int64(0), ComputeOfficialQuota(0, 0.5))
	assert.Equal(t, int64(1000), ComputeOfficialQuota(1000, 1))
	assert.Equal(t, int64(1000), ComputeOfficialQuota(1000, 0), "非法 group_ratio 视为 1")
	assert.Equal(t, int64(2000), ComputeOfficialQuota(1000, 0.5))
	assert.Equal(t, int64(333), ComputeOfficialQuota(1000, 3), "四舍五入")

	other := NewLogOther()
	other.SetPublic("group_ratio", 0.8)
	assert.InDelta(t, 0.8, GroupRatioFromLogOther(other), 1e-9)
	assert.Equal(t, 1.0, GroupRatioFromLogOther(nil))
	assert.Equal(t, 1.0, GroupRatioFromLogOther(NewLogOther()))
	assert.InDelta(t, 0.5, GroupRatioFromLogOtherJSON(`{"model_ratio":2,"group_ratio":0.5}`), 1e-9)
	assert.Equal(t, 1.0, GroupRatioFromLogOtherJSON(`{"group_ratio":0}`))
	assert.Equal(t, 1.0, GroupRatioFromLogOtherJSON("not json"))

	assert.Equal(t, int64(3600), AlignToHour(3601))
	// 上海时区 2026-03-10 23:59:59 仍是当天；UTC 16:00 = 上海次日 0 点
	assert.Equal(t, channelUsageTestDay, ChannelUsageDayStart(channelUsageTestDay+86399))
	assert.Equal(t, channelUsageTestDay+86400, ChannelUsageDayStart(channelUsageTestDay+86400))
	assert.Equal(t, channelUsageTestDay, ChannelUsageDayStart(time.Date(2026, 3, 9, 16, 0, 0, 0, time.UTC).Unix()))
	assert.Equal(t, time.Date(2026, 3, 1, 0, 0, 0, 0, enterpriseBillingLocation).Unix(), ChannelUsageMonthStart(channelUsageTestDay+5*86400))
	assert.Equal(t, "2026-03-10", ChannelUsageDayString(channelUsageTestDay))

	long := strings.Repeat("模", 250)
	assert.Equal(t, 191, len([]rune(NormalizeChannelDimModelName(long))))
	assert.Equal(t, "claude-opus-5", NormalizeChannelDimModelName("claude-opus-5"))
}

func TestChannelUsageSyncWriteUpsertsHourlyAndTotals(t *testing.T) {
	setupChannelUsagePostgres(t)
	common.ChannelUsageBatchEnabled = false
	hour := AlignToHour(channelUsageTestDay + 3600*10)

	IncrementChannelUsage(7, 800, 1000, 100, 20, hour+10)
	IncrementChannelUsage(7, 400, 500, 50, 10, hour+3599) // 同一小时累加
	IncrementChannelUsage(7, 100, 100, 5, 5, hour+3600)   // 下一小时新桶
	IncrementChannelUsage(8, 300, 300, 1, 1, hour+20)
	IncrementChannelUsage(0, 999, 999, 1, 1, hour+30) // 非法渠道忽略

	rows := loadHourlyRows(t)
	require.Len(t, rows, 3)
	first := rows[chanHourKey{7, hour}]
	assert.Equal(t, int64(1200), first.Quota)
	assert.Equal(t, int64(1500), first.OfficialQuota)
	assert.Equal(t, int64(150), first.PromptTokens)
	assert.Equal(t, int64(30), first.CompletionTokens)
	assert.Equal(t, int64(2), first.CallCount)
	assert.Equal(t, int64(100), rows[chanHourKey{7, hour + 3600}].Quota)

	totals, err := GetChannelUsageTotals()
	require.NoError(t, err)
	require.Len(t, totals, 2)
	assert.Equal(t, int64(1600), totals[7].OfficialQuota)
	assert.Equal(t, int64(3), totals[7].CallCount)
	assert.Equal(t, int64(155), totals[7].PromptTokens)
	assert.Equal(t, int64(300), totals[8].OfficialQuota)

	// 区间聚合：[hour, hour+3600) 只含第一桶；无上界含两桶
	agg, err := SumChannelUsageBetween(hour, hour+3600)
	require.NoError(t, err)
	assert.Equal(t, int64(1500), agg[7].OfficialQuota)
	assert.Equal(t, int64(2), agg[7].CallCount)
	agg, err = SumChannelUsageBetween(hour, 0)
	require.NoError(t, err)
	assert.Equal(t, int64(1600), agg[7].OfficialQuota)
	assert.Equal(t, int64(300), agg[8].Quota)
}

func TestChannelUsageBatchFlushWritesHourlyTotalsAndDims(t *testing.T) {
	setupChannelUsagePostgres(t)
	common.ChannelUsageBatchEnabled = true
	day := channelUsageTestDay
	hour := day + 3600*9

	IncrementChannelUsage(7, 800, 1000, 100, 20, hour+10)
	IncrementChannelDimUsage(7, 11, "claude-opus-5", 800, 1000, 100, 20, hour+10)
	IncrementChannelUsage(7, 200, 250, 10, 5, hour+20)
	IncrementChannelDimUsage(7, 11, "claude-opus-5", 200, 250, 10, 5, hour+20)
	IncrementChannelDimUsage(7, 0, "claude-opus-5", 20, 20, 1, 1, hour+30) // 系统请求 user_id=0
	IncrementChannelDimUsage(8, 12, "gpt-5.5", 300, 300, 30, 3, hour+40)
	IncrementChannelDimUsage(0, 12, "gpt-5.5", 999, 999, 1, 1, hour+50) // 非法渠道忽略

	// flush 前只在内存
	assert.Empty(t, loadHourlyRows(t))
	assert.Empty(t, loadDimRows(t))

	FlushChannelUsage()
	hourly := loadHourlyRows(t)
	require.Len(t, hourly, 1)
	assert.Equal(t, int64(1250), hourly[chanHourKey{7, hour}].OfficialQuota)
	assert.Equal(t, int64(2), hourly[chanHourKey{7, hour}].CallCount)
	totals, err := GetChannelUsageTotals()
	require.NoError(t, err)
	assert.Equal(t, int64(1250), totals[7].OfficialQuota)
	dims := loadDimRows(t)
	require.Len(t, dims, 3)
	opus := dims[chanDimKey{7, day, 11, "claude-opus-5"}]
	assert.Equal(t, int64(1000), opus.Quota)
	assert.Equal(t, int64(1250), opus.OfficialQuota)
	assert.Equal(t, int64(2), opus.CallCount)
	assert.Equal(t, int64(1), dims[chanDimKey{7, day, 0, "claude-opus-5"}].CallCount)

	// 第二个周期在已有行上累加；再次 flush 无增量时不报错
	IncrementChannelUsage(7, 100, 100, 1, 1, hour+60)
	IncrementChannelDimUsage(7, 11, "claude-opus-5", 100, 100, 1, 1, hour+60)
	FlushChannelUsage()
	FlushChannelUsage()
	assert.Equal(t, int64(1350), loadHourlyRows(t)[chanHourKey{7, hour}].OfficialQuota)
	assert.Equal(t, int64(3), loadDimRows(t)[chanDimKey{7, day, 11, "claude-opus-5"}].CallCount)
	totals, err = GetChannelUsageTotals()
	require.NoError(t, err)
	assert.Equal(t, int64(3), totals[7].CallCount)
}

func TestChannelUsageDimAggregateFilterAndReplaceDay(t *testing.T) {
	setupChannelUsagePostgres(t)
	day := channelUsageTestDay
	seed := []ChannelDailyDimUsage{
		{ChannelId: 7, DayStart: day, UserId: 11, ModelName: "opus", Quota: 100, OfficialQuota: 200, CallCount: 1},
		{ChannelId: 7, DayStart: day + 86400, UserId: 11, ModelName: "opus", Quota: 50, OfficialQuota: 100, CallCount: 1},
		{ChannelId: 7, DayStart: day, UserId: 11, ModelName: "sonnet", Quota: 30, OfficialQuota: 30, CallCount: 2},
		{ChannelId: 7, DayStart: day, UserId: 12, ModelName: "opus", Quota: 70, OfficialQuota: 70, CallCount: 3},
		{ChannelId: 7, DayStart: day + 2*86400, UserId: 12, ModelName: "opus", Quota: 999, OfficialQuota: 999, CallCount: 9}, // 区间外
		{ChannelId: 8, DayStart: day, UserId: 11, ModelName: "opus", Quota: 5, OfficialQuota: 5, CallCount: 1},
	}
	require.NoError(t, DB.Create(&seed).Error)
	start, end := day, day+2*86400

	byUser, err := AggregateChannelDimUsageByUser([]int{7}, start, end, "")
	require.NoError(t, err)
	users := map[int]ChannelDimUsageAgg{}
	for _, r := range byUser {
		assert.Equal(t, 7, r.ChannelId)
		users[r.UserId] = r
	}
	require.Len(t, users, 2)
	assert.Equal(t, int64(330), users[11].OfficialQuota)
	assert.Equal(t, int64(4), users[11].CallCount)
	assert.Equal(t, int64(70), users[12].Quota)

	onlyOpus, err := AggregateChannelDimUsageByUser([]int{7}, start, end, "opus")
	require.NoError(t, err)
	users = map[int]ChannelDimUsageAgg{}
	for _, r := range onlyOpus {
		users[r.UserId] = r
	}
	assert.Equal(t, int64(300), users[11].OfficialQuota)

	byModel, err := AggregateChannelDimUsageByModel([]int{7, 8}, start, end, nil)
	require.NoError(t, err)
	type modelKey struct {
		channel int
		model   string
	}
	models := map[modelKey]ChannelDimUsageAgg{}
	for _, r := range byModel {
		models[modelKey{r.ChannelId, r.ModelName}] = r
	}
	require.Len(t, models, 3)
	assert.Equal(t, int64(370), models[modelKey{7, "opus"}].OfficialQuota)
	assert.Equal(t, int64(5), models[modelKey{8, "opus"}].Quota)

	user12, err := AggregateChannelDimUsageByModel([]int{7}, start, end, []int{12})
	require.NoError(t, err)
	require.Len(t, user12, 1)
	assert.Equal(t, int64(70), user12[0].OfficialQuota)

	coverage, err := GetChannelDimUsageCoverageStart()
	require.NoError(t, err)
	assert.Equal(t, day, coverage)

	// 整天替换：陈旧行删掉、相邻天保留；重跑幂等，空结果清空当天
	require.NoError(t, ReplaceChannelDimUsageDay(day, []ChannelDailyDimUsage{
		{ChannelId: 7, DayStart: day, UserId: 11, ModelName: "rebuilt", Quota: 10, CallCount: 1},
	}))
	rows := loadDimRows(t)
	_, stale := rows[chanDimKey{7, day, 11, "opus"}]
	assert.False(t, stale)
	assert.Equal(t, int64(10), rows[chanDimKey{7, day, 11, "rebuilt"}].Quota)
	assert.Equal(t, int64(50), rows[chanDimKey{7, day + 86400, 11, "opus"}].Quota)
	require.NoError(t, ReplaceChannelDimUsageDay(day, nil))
	assert.Len(t, loadDimRows(t), 2)

	coverage, err = GetChannelDimUsageCoverageStart()
	require.NoError(t, err)
	assert.Equal(t, day+86400, coverage)
}

func TestChannelUsageCoverageStartEmpty(t *testing.T) {
	setupChannelUsagePostgres(t)
	coverage, err := GetChannelDimUsageCoverageStart()
	require.NoError(t, err)
	assert.Equal(t, int64(0), coverage)
}

// 消费记账点契约：RecordConsumeLog / RecordTaskBillingLog 写入三张统计表，官方价值按 group_ratio 剥离折扣
func TestRecordConsumeLogFeedsChannelUsage(t *testing.T) {
	setupChannelUsagePostgres(t)
	common.ChannelUsageBatchEnabled = false
	previousLogConsume := common.LogConsumeEnabled
	common.LogConsumeEnabled = true
	t.Cleanup(func() { common.LogConsumeEnabled = previousLogConsume })

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	c.Set("username", "alice")
	other := NewLogOther()
	other.SetPublic("group_ratio", 0.5)
	RecordConsumeLog(c, 11, RecordConsumeLogParams{ChannelId: 7, ModelName: "claude-opus-5", Quota: 1000, PromptTokens: 100, CompletionTokens: 20, Other: other})
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: 12, LogType: LogTypeConsume, ChannelId: 7, ModelName: "sora", Quota: 300, Other: NewLogOther()})
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: 12, LogType: LogTypeRefund, ChannelId: 7, ModelName: "sora", Quota: 300, Other: NewLogOther()}) // 退款不计
	RecordConsumeLog(c, 11, RecordConsumeLogParams{ChannelId: 0, ModelName: "claude-opus-5", Quota: 1000, Other: other})                                    // 无渠道不计

	totals, err := GetChannelUsageTotals()
	require.NoError(t, err)
	require.Len(t, totals, 1)
	assert.Equal(t, int64(2300), totals[7].OfficialQuota, "1000/0.5 + 300")
	assert.Equal(t, int64(2), totals[7].CallCount)
	assert.Equal(t, int64(100), totals[7].PromptTokens)

	dims := loadDimRows(t)
	require.Len(t, dims, 2)
	today := ChannelUsageDayStart(common.GetTimestamp())
	assert.Equal(t, int64(2000), dims[chanDimKey{7, today, 11, "claude-opus-5"}].OfficialQuota)
	assert.Equal(t, int64(1000), dims[chanDimKey{7, today, 11, "claude-opus-5"}].Quota)
	assert.Equal(t, int64(300), dims[chanDimKey{7, today, 12, "sora"}].OfficialQuota)

	var logCount int64
	require.NoError(t, LOG_DB.Model(&Log{}).Count(&logCount).Error)
	assert.Equal(t, int64(4), logCount, "消费日志本身照常落库")
}

func TestLoadChannelUsagePayerProfiles(t *testing.T) {
	setupChannelUsagePostgres(t)
	prepaid := &User{Username: "prepaid", Password: "password123", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Quota: 5000, Group: "vip", AffCode: "P1"}
	credit := &User{Username: "credit", Password: "password123", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Quota: 10, AffCode: "C1"}
	solo := &User{Username: "solo", Password: "password123", Role: common.RoleCommonUser, Status: common.UserStatusDisabled, Quota: 70, AffCode: "S1"}
	for _, u := range []*User{prepaid, credit, solo} {
		require.NoError(t, DB.Create(u).Error)
	}
	require.NoError(t, UpgradeUserToEnterprise(prepaid.Id, &Enterprise{Name: "Prepaid Co"}))
	require.NoError(t, UpgradeUserToEnterprise(credit.Id, &Enterprise{Name: "Credit Co"}))
	creditEnterprise, err := GetEnterpriseByUserId(credit.Id)
	require.NoError(t, err)
	require.NoError(t, ConfigureEnterpriseCredit(creditEnterprise.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleNaturalMonth, LimitQuota: 100000}, 1))
	period, err := EnsureOpenCreditPeriod(creditEnterprise.Id)
	require.NoError(t, err)
	require.NoError(t, DB.Model(&EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Update("used_quota", 20000).Error)
	plan := &SubscriptionPlan{Title: "Pro", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 1000, Enabled: true}
	require.NoError(t, DB.Create(plan).Error)
	now := common.GetTimestamp()
	require.NoError(t, DB.Create(&UserSubscription{UserId: solo.Id, PlanId: plan.Id, AmountTotal: 1000, StartTime: now - 3600, EndTime: now + 86400, Status: "active", Source: "admin"}).Error)
	require.NoError(t, DB.Create(&UserSubscription{UserId: prepaid.Id, PlanId: plan.Id, AmountTotal: 1000, StartTime: now - 7200, EndTime: now - 3600, Status: "expired", Source: "order"}).Error)

	profiles, err := LoadChannelUsagePayerProfiles([]int{prepaid.Id, credit.Id, solo.Id, 99999})
	require.NoError(t, err)
	require.Len(t, profiles, 3)

	p := profiles[prepaid.Id]
	assert.Equal(t, "prepaid", p.Username)
	assert.Equal(t, "vip", p.Group)
	assert.Equal(t, 5000, p.RemainQuota)
	assert.True(t, p.IsEnterprise)
	assert.Equal(t, "Prepaid Co", p.EnterpriseName)
	assert.Equal(t, EnterpriseBillingModePrepaid, p.BillingMode)
	assert.Nil(t, p.CreditPeriod)
	assert.False(t, p.HasSubscription, "过期订阅不算生效")

	c := profiles[credit.Id]
	assert.Equal(t, EnterpriseBillingModeCredit, c.BillingMode)
	require.NotNil(t, c.CreditPeriod)
	assert.Equal(t, int64(100000), c.CreditPeriod.LimitQuota)
	assert.Equal(t, int64(20000), c.CreditPeriod.UsedQuota)

	s := profiles[solo.Id]
	assert.False(t, s.IsEnterprise)
	assert.Equal(t, common.UserStatusDisabled, s.Status)
	assert.True(t, s.HasSubscription)
}

func TestSumLogNetQuotaByUsers(t *testing.T) {
	setupChannelUsagePostgres(t)
	day := channelUsageTestDay
	logs := []Log{
		{UserId: 11, Type: LogTypeConsume, Quota: 1000, CreatedAt: day + 10},
		{UserId: 11, Type: LogTypeRefund, Quota: 100, CreatedAt: day + 20},
		{UserId: 11, Type: LogTypeConsume, Quota: 500, CreatedAt: day + 86400},
		{UserId: 12, Type: LogTypeConsume, Quota: 300, CreatedAt: day + 30},
		{UserId: 12, Type: LogTypeTopup, Quota: 9999, CreatedAt: day + 40},        // 非消费类型不计
		{UserId: 11, Type: LogTypeConsume, Quota: 9999, CreatedAt: day + 2*86400}, // 窗口外（右开）
	}
	for i := range logs {
		require.NoError(t, createLog(&logs[i]))
	}
	net, err := SumLogNetQuotaByUsers([]int{11, 12, 13}, day, day+2*86400)
	require.NoError(t, err)
	assert.Equal(t, int64(1400), net[11])
	assert.Equal(t, int64(300), net[12])
	_, has13 := net[13]
	assert.False(t, has13)

	net, err = SumLogNetQuotaByUsers(nil, day, day+86400)
	require.NoError(t, err)
	assert.Empty(t, net)
}
