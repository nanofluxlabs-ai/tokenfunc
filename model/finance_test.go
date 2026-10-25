package model

import (
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 财务中心只支持 PostgreSQL，测试跑在真实 PG 上；与企业模块不同的是同时替换 LOG_DB（logs 聚合走日志库）
func setupFinancePostgres(t *testing.T) {
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
	DB, LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	initCol()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(financeTestTables...))
		require.NoError(t, sqlDB.Close())
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		initCol()
	})
	require.NoError(t, db.Migrator().DropTable(financeTestTables...))
	require.NoError(t, db.AutoMigrate(financeTestTables...))
	// 各测试的用户 id 会重复，清掉上一个测试留下的汇总缓存
	financeUsageCache.Range(func(key, _ any) bool {
		financeUsageCache.Delete(key)
		return true
	})
}

var financeTestTables = []any{
	&User{}, &Token{}, &Log{}, &TopUp{}, &SubscriptionPlan{}, &SubscriptionOrder{}, &UserSubscription{}, &Channel{}, &Redemption{},
	&Enterprise{}, &EnterpriseTeam{}, &EnterpriseMember{}, &EnterpriseTokenAssignment{},
	&EnterpriseCreditPeriod{}, &EnterpriseCreditNotifyRecord{}, &EnterpriseLedgerEntry{}, &EnterpriseUsageDaily{}, &EnterpriseBill{},
	&LogDailyRollup{}, &LogArchiveManifest{}, &Option{},
}

// financeTestDay 固定的测试日（上海时区 2026-03-10 00:00）
var financeTestDay = time.Date(2026, 3, 10, 0, 0, 0, 0, enterpriseBillingLocation)

func financeTestAt(hour int, minute int) int64 {
	return financeTestDay.Add(time.Duration(hour)*time.Hour + time.Duration(minute)*time.Minute).Unix()
}

func insertFinanceLog(t *testing.T, log Log) {
	t.Helper()
	if log.Type == 0 {
		log.Type = LogTypeConsume
	}
	if log.CreatedAt == 0 {
		log.CreatedAt = financeTestAt(10, 0)
	}
	require.NoError(t, createLog(&log))
}

func TestFinanceOrdersUnionAndDerivation(t *testing.T) {
	setupFinancePostgres(t)
	alice := createEnterpriseTestUser(t, "alice", common.RoleCommonUser)
	bob := createEnterpriseTestUser(t, "bob", common.RoleCommonUser)
	plan := &SubscriptionPlan{Title: "Pro 月付", PriceAmount: 30, Currency: "USD", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 1_500_000}
	require.NoError(t, DB.Create(plan).Error)
	completed := financeTestAt(12, 0)
	topups := []TopUp{
		{UserId: alice.Id, Amount: 10, Money: 73, TradeNo: "EPAY1", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess, CreateTime: completed - 60, CompleteTime: completed},
		{UserId: alice.Id, Amount: 20, Money: 20, TradeNo: "STRIPE1", PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess, CreateTime: completed - 60, CompleteTime: completed + 1},
		{UserId: bob.Id, Amount: 500000, Money: 1, TradeNo: "CREEM1", PaymentMethod: PaymentMethodCreem, PaymentProvider: PaymentProviderCreem, Status: common.TopUpStatusPending, CreateTime: completed + 2},
		// 在线支付订阅完成时上游写入的镜像行：同 trade_no、Amount=0，必须被剔除
		{UserId: bob.Id, Amount: 0, Money: 30, TradeNo: "SUB1", PaymentMethod: PaymentMethodStripe, Status: common.TopUpStatusSuccess, CreateTime: completed - 60, CompleteTime: completed + 3},
	}
	for i := range topups {
		require.NoError(t, DB.Create(&topups[i]).Error)
	}
	orders := []SubscriptionOrder{
		{UserId: bob.Id, PlanId: plan.Id, Money: 30, TradeNo: "SUB1", PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess, CreateTime: completed - 60, CompleteTime: completed + 3},
		{UserId: alice.Id, PlanId: plan.Id, Money: 30, TradeNo: "SUBBAL1", PaymentMethod: PaymentMethodBalance, PaymentProvider: PaymentProviderBalance, Status: common.TopUpStatusSuccess, CreateTime: completed - 60, CompleteTime: completed + 4},
	}
	for i := range orders {
		require.NoError(t, DB.Create(&orders[i]).Error)
	}
	r, err := ParseFinanceDayRange("2026-03-10", "2026-03-10")
	require.NoError(t, err)

	items, total, err := ListFinanceOrders(FinanceOrderFilter{Range: r}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	byTrade := make(map[string]FinanceOrderItem)
	for _, item := range items {
		byTrade[item.TradeNo] = item
	}
	require.Len(t, byTrade, 5)
	epay := byTrade["EPAY1"]
	assert.Equal(t, FinanceOrderTypeWalletTopup, epay.OrderType)
	assert.Equal(t, "CNY", epay.Currency)
	assert.Equal(t, 73.0, epay.Amount)
	assert.Equal(t, 10.0, epay.USDAmount)
	assert.Equal(t, int64(10*common.QuotaPerUnit), epay.CreditAmount)
	assert.Equal(t, "alice", epay.Username)
	stripe := byTrade["STRIPE1"]
	assert.Equal(t, "USD", stripe.Currency)
	assert.Equal(t, 20.0, stripe.USDAmount)
	assert.Equal(t, int64(20*common.QuotaPerUnit), stripe.CreditAmount)
	creem := byTrade["CREEM1"]
	assert.Equal(t, int64(500000), creem.CreditAmount)
	assert.Equal(t, common.TopUpStatusPending, creem.Status)
	sub := byTrade["SUB1"]
	assert.Equal(t, FinanceOrderTypeSubscription, sub.OrderType)
	assert.Equal(t, "Pro 月付", sub.Subject)
	assert.Equal(t, int64(1_500_000), sub.CreditAmount)
	assert.Equal(t, 30.0, sub.USDAmount)
	assert.Equal(t, FinanceOrderTypeSubscription, byTrade["SUBBAL1"].OrderType)

	_, total, err = ListFinanceOrders(FinanceOrderFilter{Range: r, OrderType: FinanceOrderTypeSubscription}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	_, total, err = ListFinanceOrders(FinanceOrderFilter{Range: r, Status: common.TopUpStatusPending}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	_, total, err = ListFinanceOrders(FinanceOrderFilter{Range: r, PaymentMethod: PaymentMethodStripe}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	_, total, err = ListFinanceOrders(FinanceOrderFilter{Range: r, Username: "ALI"}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)

	firstPaid, err := FinanceFirstPaidTimes(r.EndExcl)
	require.NoError(t, err)
	assert.Equal(t, completed, firstPaid[alice.Id])
	assert.Equal(t, completed+3, firstPaid[bob.Id])
}

func TestFinanceOverview(t *testing.T) {
	setupFinancePostgres(t)
	registeredAt := financeTestAt(9, 0)
	normal := createEnterpriseTestUser(t, "normal", common.RoleCommonUser)
	admin := createEnterpriseTestUser(t, "admin", common.RoleAdminUser)
	owner := createEnterpriseTestUser(t, "owner", common.RoleCommonUser)
	payer := createEnterpriseTestUser(t, "payer", common.RoleCommonUser)
	require.NoError(t, DB.Model(&User{}).Where("id IN ?", []int{normal.Id, admin.Id, owner.Id}).Update("created_at", registeredAt).Error)
	// payer 注册在区间之外
	require.NoError(t, DB.Model(&User{}).Where("id = ?", payer.Id).Update("created_at", registeredAt-86400*5).Error)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Owner Co"}))
	require.NoError(t, DB.Create(&TopUp{UserId: payer.Id, Amount: 5, Money: 36.5, TradeNo: "PAY1", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		Status: common.TopUpStatusSuccess, CreateTime: financeTestAt(8, 0), CompleteTime: financeTestAt(8, 30)}).Error)

	// 2026-03-11 00:30 上海时间 = 2026-03-10 16:30 UTC，必须分到 03-11
	insertFinanceLog(t, Log{UserId: normal.Id, Username: "normal", Quota: 1000, CreatedAt: financeTestAt(24, 30)})
	insertFinanceLog(t, Log{UserId: normal.Id, Username: "normal", Quota: 200, Type: LogTypeRefund, CreatedAt: financeTestAt(24, 31)})
	insertFinanceLog(t, Log{UserId: admin.Id, Username: "admin", Quota: 500})
	insertFinanceLog(t, Log{UserId: owner.Id, Username: "owner", Quota: 300})
	insertFinanceLog(t, Log{UserId: payer.Id, Username: "payer", Quota: 400})

	r, err := ParseFinanceDayRange("2026-03-10", "2026-03-11")
	require.NoError(t, err)
	overview, err := GetFinanceOverview(r)
	require.NoError(t, err)
	require.Len(t, overview.Daily, 2)
	day0, day1 := overview.Daily[0], overview.Daily[1]
	assert.Equal(t, "2026-03-10", day0.Date)
	assert.Equal(t, int64(3), day0.NewUsers)
	assert.Equal(t, int64(1), day0.NewPaidUsers)
	assert.Equal(t, int64(1), day0.PaidOrderCount)
	assert.InDelta(t, 5.0, day0.PaidAmount, 1e-9)
	assert.InDelta(t, 5.0, day0.WalletAmount, 1e-9)
	assert.Equal(t, 0.0, day0.SubscriptionAmount)
	assert.Equal(t, int64(500+300+400), day0.AllUserConsumeQuota)
	assert.Equal(t, int64(300+400), day0.PaidUserConsumeQuota, "管理员与无订单的普通用户不计入付费用户消耗")
	assert.Equal(t, "2026-03-11", day1.Date)
	assert.Equal(t, int64(800), day1.AllUserConsumeQuota, "退款抵扣消耗")
	assert.Equal(t, int64(0), day1.PaidUserConsumeQuota)
	assert.Equal(t, int64(2000), overview.Summary.AllUserConsumeQuota)
	assert.Equal(t, "USD", overview.DisplayCurrency)
}

func TestFinanceUsageSummaryRatiosAndPrices(t *testing.T) {
	setupFinancePostgres(t)
	user := createEnterpriseTestUser(t, "usage", common.RoleCommonUser)
	claudeOther := `{"model_ratio":2.5,"group_ratio":1,"completion_ratio":5,"cache_ratio":0.1,"cache_tokens":1000,"cache_creation_tokens":300,"cache_creation_ratio":1.25,"cache_creation_tokens_5m":200,"cache_creation_ratio_5m":1.25,"cache_creation_tokens_1h":100,"cache_creation_ratio_1h":2,"model_price":-1,"usage_semantic":"anthropic","claude":true}`
	insertFinanceLog(t, Log{UserId: user.Id, Group: "default", ModelName: "claude-opus", TokenName: "k1", PromptTokens: 50, CompletionTokens: 20, Quota: 6000, Other: claudeOther})
	insertFinanceLog(t, Log{UserId: user.Id, Group: "default", ModelName: "claude-opus", TokenName: "k1", PromptTokens: 10, CompletionTokens: 5, Quota: 1000,
		Other: `{"model_ratio":3,"group_ratio":1,"completion_ratio":5,"cache_ratio":0.1,"cache_tokens":0,"cache_creation_tokens":0,"cache_creation_ratio":1.25,"model_price":-1,"usage_semantic":"anthropic"}`})
	// OpenAI 语义：prompt_tokens 含缓存
	insertFinanceLog(t, Log{UserId: user.Id, Group: "default", ModelName: "gpt-4o", TokenName: "k2", PromptTokens: 100, CompletionTokens: 30, Quota: 2000,
		Other: `{"model_ratio":1,"group_ratio":1,"completion_ratio":4,"cache_ratio":0.5,"cache_tokens":40,"model_price":-1}`})
	insertFinanceLog(t, Log{UserId: user.Id, Group: "vip", ModelName: "gpt-4o", TokenName: "k2", PromptTokens: 10, CompletionTokens: 1, Quota: 500,
		Other: `{"model_ratio":1,"group_ratio":1,"user_group_ratio":0.8,"completion_ratio":4,"cache_ratio":0.5,"cache_tokens":0,"model_price":-1}`})
	// 按次计费：单价全空
	insertFinanceLog(t, Log{UserId: user.Id, Group: "default", ModelName: "dall-e", TokenName: "k3", Quota: 50000, Other: `{"model_ratio":1,"group_ratio":1,"completion_ratio":1,"model_price":0.1}`})
	// 非 JSON 的 other 不能让整个查询失败
	insertFinanceLog(t, Log{UserId: user.Id, Group: "default", ModelName: "legacy", Quota: 10, Other: ""})
	insertFinanceLog(t, Log{UserId: user.Id, Group: "default", ModelName: "legacy", Quota: 10, Other: "plain text"})
	// 其他用户、退款、区间外的日志都不计入
	insertFinanceLog(t, Log{UserId: user.Id + 1000, Group: "default", ModelName: "legacy", Quota: 99})
	insertFinanceLog(t, Log{UserId: user.Id, Group: "default", ModelName: "legacy", Quota: 99, Type: LogTypeRefund})
	insertFinanceLog(t, Log{UserId: user.Id, Group: "default", ModelName: "legacy", Quota: 99, CreatedAt: financeTestAt(-1, 0)})

	r, err := ParseFinanceDayRange("2026-03-10", "2026-03-10")
	require.NoError(t, err)
	summary, err := GetFinanceUsageSummary(user.Id, r)
	require.NoError(t, err)
	assert.Equal(t, int64(7), summary.TotalCalls)
	assert.Equal(t, int64(6000+1000+2000+500+50000+20), summary.TotalQuota)
	assert.Equal(t, "0.119040", summary.TotalAmountUSD)
	rows := make(map[string]*FinanceGroupModelRow)
	for _, row := range summary.ByGroupModel {
		rows[row.Group+"/"+row.ModelName] = row
	}
	require.Len(t, rows, 5)

	claude := rows["default/claude-opus"]
	assert.Equal(t, int64(2), claude.Count)
	assert.Equal(t, int64(60), claude.InputTokens, "Claude 语义 prompt_tokens 即净输入")
	assert.Equal(t, int64(1000), claude.CachedTokens)
	assert.Equal(t, int64(300), claude.CacheCreationTokens)
	assert.Equal(t, int64(100), claude.CacheCreation1hTokens)
	require.NotNil(t, claude.Ratios.ModelRatio)
	assert.Equal(t, 2.5, claude.Ratios.ModelRatio.Value, "主值取消费最大的倍率")
	assert.Equal(t, []FinanceRatioShare{{Value: 2.5, Quota: 6000}, {Value: 3, Quota: 1000}}, claude.Ratios.ModelRatio.Shares)
	assert.Nil(t, claude.Ratios.GroupRatio.Shares, "只有一个取值时不下发 shares")
	assert.Nil(t, claude.Ratios.ModelPrice)
	require.NotNil(t, claude.UnitPrices.Input)
	assert.InDelta(t, 5.0, *claude.UnitPrices.Input, 1e-9)
	assert.InDelta(t, 0.5, *claude.UnitPrices.CacheRead, 1e-9)
	assert.InDelta(t, 6.25, *claude.UnitPrices.CacheWrite5m, 1e-9)
	assert.InDelta(t, 10.0, *claude.UnitPrices.CacheWrite1h, 1e-9)
	assert.InDelta(t, 25.0, *claude.UnitPrices.Output, 1e-9)
	assert.Equal(t, "0.014000", claude.AmountUSD)

	openai := rows["default/gpt-4o"]
	assert.Equal(t, int64(60), openai.InputTokens, "OpenAI 语义扣除缓存命中")
	assert.Equal(t, int64(40), openai.CachedTokens)
	assert.Nil(t, openai.UnitPrices.CacheWrite5m, "没有缓存写入倍率时该单价为空")

	vip := rows["vip/gpt-4o"]
	require.NotNil(t, vip.Ratios.GroupRatio)
	assert.Equal(t, 0.8, vip.Ratios.GroupRatio.Value, "专属分组倍率优先")
	assert.True(t, vip.Ratios.GroupRatioExclusive)
	assert.InDelta(t, 1.6, *vip.UnitPrices.Input, 1e-9)

	perCall := rows["default/dall-e"]
	require.NotNil(t, perCall.Ratios.ModelPrice)
	assert.Equal(t, 0.1, perCall.Ratios.ModelPrice.Value)
	assert.Nil(t, perCall.UnitPrices.Input)
	assert.InDelta(t, 84.01, perCall.Percentage, 0.001)

	legacy := rows["default/legacy"]
	assert.Equal(t, int64(2), legacy.Count)
	assert.Nil(t, legacy.Ratios.ModelRatio)

	assert.Len(t, summary.ByModel, 4)
	assert.Equal(t, "dall-e", summary.ByModel[0].ModelName)

	daily, err := GetFinanceUsageDaily(user.Id, r)
	require.NoError(t, err)
	require.Len(t, daily.ByDay, 1)
	assert.Equal(t, "2026-03-10", daily.ByDay[0].Day)
	assert.Equal(t, int64(7), daily.ByDay[0].Calls)
	assert.Equal(t, int64(300), daily.ByDay[0].CacheCreationTokens)
	assert.Equal(t, 100.0, daily.ByDay[0].Percentage)

	details, total, err := ListFinanceUsageDetail(user.Id, r, 0, 3)
	require.NoError(t, err)
	assert.Equal(t, int64(7), total)
	require.Len(t, details, 3)
	exported, err := ListFinanceUsageForExport(user.Id, r)
	require.NoError(t, err)
	assert.Len(t, exported, 7)
}

func TestFinanceUserConsumptions(t *testing.T) {
	setupFinancePostgres(t)
	u1 := createEnterpriseTestUser(t, "u1", common.RoleCommonUser)
	u2 := createEnterpriseTestUser(t, "u2", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(u2.Id, &Enterprise{Name: "U2 Corp"}))
	enterprise, err := GetEnterpriseByUserId(u2.Id)
	require.NoError(t, err)
	require.NoError(t, ConfigureEnterpriseCredit(enterprise.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleNaturalMonth, LimitQuota: 2_000_000}, 0))
	_, err = EnsureOpenCreditPeriod(enterprise.Id)
	require.NoError(t, err)
	require.NoError(t, DB.Create(&TopUp{UserId: u1.Id, Amount: 5, Money: 5, TradeNo: "U1PAY", PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe,
		Status: common.TopUpStatusSuccess, CreateTime: financeTestAt(1, 0), CompleteTime: financeTestAt(1, 0)}).Error)

	insertFinanceLog(t, Log{UserId: u1.Id, Username: "u1", PromptTokens: 100, CompletionTokens: 30, Quota: 1000,
		Other: `{"text_input":80,"audio_input":5,"cache_tokens":10,"billing_source":"subscription","subscription_consumed":700,"wallet_quota_deducted":0}`})
	insertFinanceLog(t, Log{UserId: u1.Id, Username: "u1", PromptTokens: 50, CompletionTokens: 10, Quota: 500, CreatedAt: financeTestAt(11, 0)})
	insertFinanceLog(t, Log{UserId: u1.Id, Username: "u1", Quota: 100, Type: LogTypeRefund})
	insertFinanceLog(t, Log{UserId: u2.Id, Username: "u2", PromptTokens: 10, CompletionTokens: 10, Quota: 3000})

	r, err := ParseFinanceDayRange("2026-03-10", "2026-03-10")
	require.NoError(t, err)
	items, total, err := ListFinanceUserConsumptions(FinanceUserConsumptionFilter{Range: r}, 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	require.Len(t, items, 2)
	assert.Equal(t, u2.Id, items[0].UserId, "按净消耗降序")

	owner := items[0]
	assert.True(t, owner.IsEnterprise)
	assert.Equal(t, "U2 Corp", owner.EnterpriseName)
	assert.Equal(t, EnterpriseBillingModeCredit, owner.BillingMode)
	require.NotNil(t, owner.CreditPeriod)
	assert.Equal(t, int64(2_000_000), owner.CreditPeriod.LimitQuota)
	assert.True(t, owner.IsPaidUser)
	assert.False(t, owner.HasSuccessfulOrder)

	personal := items[1]
	assert.Equal(t, int64(1500), personal.ConsumeQuota)
	assert.Equal(t, int64(100), personal.RefundQuota)
	assert.Equal(t, int64(1400), personal.NetQuota)
	assert.Equal(t, int64(2), personal.ConsumeCount)
	assert.Equal(t, int64(190), personal.TotalTokens)
	assert.Equal(t, int64(130), personal.TextInputTokens, "显式 text_input 与退化口径各一条")
	assert.Equal(t, int64(40), personal.TextOutputTokens)
	assert.Equal(t, int64(10), personal.CacheReadTokens)
	assert.Equal(t, int64(5), personal.AudioInputTokens)
	assert.Equal(t, int64(700), personal.SubscriptionConsumeQuota)
	assert.Equal(t, int64(500), personal.WalletConsumeQuota)
	assert.Equal(t, financeTestAt(11, 0), personal.LastConsumeAt)
	assert.Equal(t, "default", personal.Group)
	assert.Equal(t, 1000, personal.RemainQuota)
	assert.True(t, personal.HasSuccessfulOrder)
	assert.True(t, personal.IsPaidUser)
	assert.Nil(t, personal.CreditPeriod)

	page, total, err := ListFinanceUserConsumptions(FinanceUserConsumptionFilter{Range: r}, 1, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	require.Len(t, page, 1)
	assert.Equal(t, u1.Id, page[0].UserId)

	byKeyword, _, err := ListFinanceUserConsumptions(FinanceUserConsumptionFilter{Range: r, Keyword: "U2"}, 0, 10)
	require.NoError(t, err)
	require.Len(t, byKeyword, 1)
	assert.Equal(t, u2.Id, byKeyword[0].UserId)

	require.NoError(t, DB.Create(&Channel{Id: 7, Name: "主渠道", Key: "k"}).Error)
	insertFinanceLog(t, Log{UserId: u1.Id, Username: "u1", Group: "default", ModelName: "gpt-4o", ChannelId: 7, Quota: 100, PromptTokens: 5, CompletionTokens: 5})
	modelItems, modelSummary, err := ListFinanceModelConsumptions(FinanceModelConsumptionFilter{Range: r, ModelName: "GPT"})
	require.NoError(t, err)
	require.Len(t, modelItems, 1)
	assert.Equal(t, "主渠道", modelItems[0].ChannelName)
	assert.Equal(t, int64(100), modelSummary.NetQuota)
	assert.False(t, modelSummary.Truncated)
}

func TestFinanceBillContextAndList(t *testing.T) {
	setupFinancePostgres(t)
	owner := createEnterpriseTestUser(t, "billowner", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Bill Co"}))
	enterprise, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	require.NoError(t, ConfigureEnterpriseCredit(enterprise.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleNaturalMonth, LimitQuota: 1_000_000}, 0))
	open, err := EnsureOpenCreditPeriod(enterprise.Id)
	require.NoError(t, err)

	// 一个已到期、待出账的历史账期 [s, e)
	start, end := financeTestAt(0, 0), financeTestAt(48, 0)
	closing := &EnterpriseCreditPeriod{EnterpriseId: enterprise.Id, PeriodNo: 99, StartAt: start, EndAt: end, LimitQuota: 1_000_000, UsedQuota: 777, Status: EnterpriseCreditPeriodClosing, CreatedAt: start, UpdatedAt: start}
	require.NoError(t, DB.Create(closing).Error)
	insertFinanceLog(t, Log{UserId: owner.Id, Quota: 300, CreatedAt: start})
	insertFinanceLog(t, Log{UserId: owner.Id, Quota: 400, CreatedAt: end - 1})
	insertFinanceLog(t, Log{UserId: owner.Id, Quota: 500, CreatedAt: end})

	list, err := ListFinanceBills(EnterpriseBillFilter{}, true, 0, 20)
	require.NoError(t, err)
	assert.Empty(t, list.Items)
	require.Len(t, list.OpenPeriods, 2)
	for _, period := range list.OpenPeriods {
		assert.Equal(t, FinanceBillKindPeriod, period.Kind)
		assert.Equal(t, "Bill Co", period.EnterpriseName)
		assert.Equal(t, "billowner", period.Username)
	}

	context, err := GetFinanceBillContext(FinanceBillKindPeriod, closing.Id)
	require.NoError(t, err)
	assert.Equal(t, start, context.UsageTsStart)
	assert.Equal(t, end-1, context.UsageTsEnd, "对外闭区间 = 账期结束 − 1")
	assert.Equal(t, owner.Id, context.Summary.UserId)
	assert.Equal(t, "0.001554", context.Summary.TotalUSD)
	usageRange, err := FinanceRangeFromTimestamps(context.UsageTsStart, context.UsageTsEnd)
	require.NoError(t, err)
	summary, err := GetFinanceUsageSummary(owner.Id, usageRange)
	require.NoError(t, err)
	assert.Equal(t, int64(2), summary.TotalCalls, "账期结束时刻的日志属于下一期")
	assert.Equal(t, int64(700), summary.TotalQuota)

	openContext, err := GetFinanceBillContext(FinanceBillKindPeriod, open.Id)
	require.NoError(t, err)
	assert.LessOrEqual(t, openContext.UsageTsEnd, common.GetTimestamp(), "进行中账期截到当前时刻")

	bill, err := IssueCreditBill(closing.Id)
	require.NoError(t, err)
	require.NotNil(t, bill)
	billContext, err := GetFinanceBillContext(FinanceBillKindBill, bill.Id)
	require.NoError(t, err)
	assert.Equal(t, FinanceBillKindBill, billContext.Summary.Kind)
	assert.Equal(t, bill.BillNo, billContext.Summary.BillNo)
	assert.Equal(t, "0.001554", billContext.Summary.TotalUSD, "已出账金额来自 ent_bills")
	assert.Equal(t, int64(1_000_000), billContext.Summary.LimitQuota)
	assert.Equal(t, 99, billContext.Summary.PeriodNo)
	assert.Equal(t, end-1, billContext.UsageTsEnd)

	list, err = ListFinanceBills(EnterpriseBillFilter{}, true, 0, 20)
	require.NoError(t, err)
	require.Len(t, list.Items, 1)
	assert.Equal(t, bill.Id, list.Items[0].Id)
	require.Len(t, list.OpenPeriods, 1, "出账后的账期不再出现在进行中列表")
	assert.Equal(t, open.Id, list.OpenPeriods[0].Id)

	_, err = GetFinanceBillContext("unknown", 1)
	assert.Error(t, err)
	_, err = GetFinanceBillContext(FinanceBillKindPeriod, 123456)
	assert.ErrorIs(t, err, ErrEnterpriseResourceNotFound)
}

// 钱包流水：六类来源各一条，验证金额推导、符号、排序、汇总与来源筛选；他人与企业无关的数据不混入
func TestFinanceTopupLedger(t *testing.T) {
	setupFinancePostgres(t)
	owner := createEnterpriseTestUser(t, "ledgerowner", common.RoleCommonUser)
	other := createEnterpriseTestUser(t, "ledgerother", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Ledger Co"}))
	enterprise, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	plan := &SubscriptionPlan{Title: "Pro 月付", PriceAmount: 30, Currency: "USD", DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 1_500_000}
	require.NoError(t, DB.Create(plan).Error)
	base := financeTestAt(9, 0)

	// 1. 在线充值（易支付 10 美元）+ 他人的充值 + 订阅镜像行
	topups := []TopUp{
		{UserId: owner.Id, Amount: 10, Money: 73, TradeNo: "LEDGER-EPAY", PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess, CreateTime: base, CompleteTime: base + 10},
		{UserId: other.Id, Amount: 99, Money: 99, TradeNo: "LEDGER-OTHER", PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess, CreateTime: base, CompleteTime: base + 11},
		{UserId: owner.Id, Amount: 0, Money: 30, TradeNo: "LEDGER-SUBMIRROR", PaymentMethod: PaymentMethodStripe, Status: common.TopUpStatusSuccess, CreateTime: base, CompleteTime: base + 12},
		{UserId: owner.Id, Amount: 5, Money: 5, TradeNo: "LEDGER-PENDING", PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusPending, CreateTime: base + 13},
	}
	for i := range topups {
		require.NoError(t, DB.Create(&topups[i]).Error)
	}
	// 2. 在线支付的订阅（不动钱包）+ 余额购买订阅（扣钱包）
	orders := []SubscriptionOrder{
		{UserId: owner.Id, PlanId: plan.Id, Money: 30, TradeNo: "LEDGER-SUBMIRROR", PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess, CreateTime: base, CompleteTime: base + 12},
		{UserId: owner.Id, PlanId: plan.Id, Money: 30, TradeNo: "LEDGER-SUBBAL", PaymentMethod: PaymentMethodBalance, PaymentProvider: PaymentProviderBalance, Status: common.TopUpStatusSuccess, CreateTime: base, CompleteTime: base + 20, ProviderPayload: "charged_quota=15000000"},
	}
	for i := range orders {
		require.NoError(t, DB.Create(&orders[i]).Error)
	}
	// 3. 兑换码（已兑换后被软删，仍应计入）
	redemption := &Redemption{UserId: 1, Key: "ledgerkey00000000000000000000001", Status: 3, Name: "新客礼包", Quota: 250000, CreatedTime: base, RedeemedTime: base + 30, UsedUserId: owner.Id}
	require.NoError(t, DB.Create(redemption).Error)
	require.NoError(t, DB.Delete(redemption).Error)
	// 4. 企业线下充值（预付模式）
	_, err = RegisterEnterpriseTopup(enterprise.Id, 2_000_000, 1, "BANK-001", "首期款")
	require.NoError(t, err)
	require.NoError(t, DB.Model(&EnterpriseLedgerEntry{}).Where("enterprise_id = ?", enterprise.Id).Update("created_at", base+40).Error)
	// 5. 管理员调额（扣减 300000）与一条没有 op 的普通充值日志（不应重复计入）
	adjust, err := common.Marshal(AuditOther{Op: &AuditOperation{Action: "user.quota_subtract", Params: AuditFields{"from": 900000, "to": 600000, "quota": 300000}}})
	require.NoError(t, err)
	insertFinanceLog(t, Log{UserId: owner.Id, Type: LogTypeTopup, Content: "Subtracted quota", Other: string(adjust), CreatedAt: base + 50})
	insertFinanceLog(t, Log{UserId: owner.Id, Type: LogTypeTopup, Content: "使用在线充值成功", Other: `{"admin_info":{"payment_method":"alipay"}}`, CreatedAt: base + 51})
	// 6. 任务退款 + 一条 quota 为 0 的退款（忽略）
	insertFinanceLog(t, Log{UserId: owner.Id, Type: LogTypeRefund, Quota: 1234, Other: `{"task_id":"task-9","reason":"任务失败"}`, CreatedAt: base + 60})
	insertFinanceLog(t, Log{UserId: owner.Id, Type: LogTypeRefund, Quota: 0, CreatedAt: base + 61})
	// 区间外
	insertFinanceLog(t, Log{UserId: owner.Id, Type: LogTypeRefund, Quota: 99, CreatedAt: base + 86400*2})

	r, err := ParseFinanceDayRange("2026-03-10", "2026-03-10")
	require.NoError(t, err)
	entries, err := ListFinanceTopupEntries(owner.Id, r)
	require.NoError(t, err)
	require.Len(t, entries, 6)
	sources := make([]string, 0, len(entries))
	for _, entry := range entries {
		sources = append(sources, entry.Source)
	}
	assert.Equal(t, []string{FinanceTopupSourceRefund, FinanceTopupSourceAdminAdjust, FinanceTopupSourceEnterpriseTopup, FinanceTopupSourceRedemption, FinanceTopupSourceSubscriptionBalance, FinanceTopupSourceOnline}, sources, "时间倒序")
	bySource := make(map[string]FinanceTopupEntry)
	for _, entry := range entries {
		bySource[entry.Source] = entry
	}
	online := bySource[FinanceTopupSourceOnline]
	assert.Equal(t, int64(10*common.QuotaPerUnit), online.Quota)
	assert.Equal(t, "10.000000", online.AmountUSD)
	assert.Equal(t, "epay/alipay", online.PaymentMethod)
	assert.Equal(t, "LEDGER-EPAY", online.RefNo)
	assert.Equal(t, FinanceTopupTypeTopup, online.Type)
	assert.Equal(t, int64(-15_000_000), bySource[FinanceTopupSourceSubscriptionBalance].Quota)
	assert.Equal(t, "Pro 月付", bySource[FinanceTopupSourceSubscriptionBalance].Content)
	assert.Equal(t, FinanceTopupTypeSubscription, bySource[FinanceTopupSourceSubscriptionBalance].Type)
	assert.Equal(t, int64(250000), bySource[FinanceTopupSourceRedemption].Quota)
	assert.Equal(t, "新客礼包", bySource[FinanceTopupSourceRedemption].RefNo)
	assert.Equal(t, int64(2_000_000), bySource[FinanceTopupSourceEnterpriseTopup].Quota)
	assert.Equal(t, "BANK-001", bySource[FinanceTopupSourceEnterpriseTopup].RefNo)
	assert.Equal(t, "首期款", bySource[FinanceTopupSourceEnterpriseTopup].Content)
	assert.Equal(t, int64(-300000), bySource[FinanceTopupSourceAdminAdjust].Quota)
	assert.Equal(t, FinanceTopupTypeAdjust, bySource[FinanceTopupSourceAdminAdjust].Type)
	assert.Equal(t, "subtract", bySource[FinanceTopupSourceAdminAdjust].RefNo)
	assert.Equal(t, int64(1234), bySource[FinanceTopupSourceRefund].Quota)
	assert.Equal(t, "task-9", bySource[FinanceTopupSourceRefund].RefNo)
	assert.Equal(t, "任务失败", bySource[FinanceTopupSourceRefund].Content, "日志 content 为空时取 other.reason")

	summary := SummarizeFinanceTopup(entries)
	assert.Equal(t, int64(6), summary.TotalEntries)
	expectedTotal := int64(10*common.QuotaPerUnit) - 15_000_000 + 250000 + 2_000_000 - 300000 + 1234
	assert.Equal(t, expectedTotal, summary.TotalQuota)
	assert.Equal(t, FinanceQuotaToUSD(expectedTotal), summary.TotalAmountUSD)
	require.Len(t, summary.BySource, 6)
	assert.Equal(t, FinanceTopupSourceOnline, summary.BySource[0].Source, "按金额倒序，在线充值最大")
	assert.Equal(t, FinanceTopupSourceSubscriptionBalance, summary.BySource[5].Source)
	assert.Equal(t, financePercentage(int64(10*common.QuotaPerUnit), expectedTotal), summary.BySource[0].Percentage)

	otherEntries, err := ListFinanceTopupEntries(other.Id, r)
	require.NoError(t, err)
	require.Len(t, otherEntries, 1)
	assert.Equal(t, int64(99*common.QuotaPerUnit), otherEntries[0].Quota)
	assert.Equal(t, PaymentMethodStripe, otherEntries[0].PaymentMethod)
}

func TestFinanceRequiresPostgres(t *testing.T) {
	setupFinancePostgres(t)
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypeMySQL)
	t.Cleanup(func() { common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL) })
	r, err := ParseFinanceDayRange("2026-03-10", "2026-03-10")
	require.NoError(t, err)
	_, err = GetFinanceOverview(r)
	assert.ErrorIs(t, err, ErrFinanceRequiresPostgres)
	_, _, err = ListFinanceOrders(FinanceOrderFilter{Range: r}, 0, 10)
	assert.ErrorIs(t, err, ErrFinanceRequiresPostgres)

	_, err = ParseFinanceDayRange("2026-03-11", "2026-03-10")
	assert.ErrorIs(t, err, ErrFinanceInvalidRange)
	wide, err := ParseFinanceDayRange("2026-01-01", "2026-12-31")
	require.NoError(t, err)
	assert.ErrorIs(t, wide.CheckMaxDays(FinanceMaxRangeDays), ErrFinanceRangeTooLarge)
	assert.Equal(t, []string{"2026-03-10", "2026-03-11"}, FinanceRange{Start: financeTestAt(0, 0), EndExcl: financeTestAt(48, 0)}.Days())
}
