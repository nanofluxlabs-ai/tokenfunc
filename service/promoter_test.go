package service

import (
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 推广人模块只支持 PostgreSQL（部分唯一索引），测试跑在真实 PG 上，主库与日志库共用同一连接
func setupPromoterPostgres(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	tables := []any{&model.User{}, &model.Log{}, &model.Option{}, &model.Enterprise{}, &model.EnterpriseCreditPeriod{}, &model.EnterpriseCreditNotifyRecord{}, &model.EnterpriseBill{}, &model.LogDailyRollup{}, &model.Promoter{}, &model.PromoterBinding{}, &model.PromoterSettlement{}}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	model.InitColumnNames()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		model.InitColumnNames()
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
}

func newPromoterTestUser(t *testing.T, username string, role int) *model.User {
	t.Helper()
	user := &model.User{Username: username, Password: "password123", DisplayName: username, Role: role, Status: common.UserStatusEnabled, Quota: 1000, AffCode: username}
	require.NoError(t, model.DB.Create(user).Error)
	return user
}

func messageKey(t *testing.T, err error) string {
	t.Helper()
	require.Error(t, err)
	message, ok := err.(*common.Message)
	require.True(t, ok, "expected *common.Message, got %T: %v", err, err)
	return message.Key
}

func TestPromoterRulesAndLifecycle(t *testing.T) {
	setupPromoterPostgres(t)
	const operator = 1
	admin := newPromoterTestUser(t, "admin", common.RoleAdminUser)
	promoterUser := newPromoterTestUser(t, "promo", common.RoleCommonUser)
	otherPromoterUser := newPromoterTestUser(t, "promo2", common.RoleCommonUser)
	alice := newPromoterTestUser(t, "alice", common.RoleCommonUser)
	bob := newPromoterTestUser(t, "bob", common.RoleCommonUser)

	// 设为推广人：管理员不行、不存在不行、重复不行
	assert.Equal(t, errPromoterAdmin, messageKey(t, func() error { _, err := SetPromoter(operator, admin.Id, "", 0); return err }()))
	assert.Equal(t, errPromoterUserMissing, messageKey(t, func() error { _, err := SetPromoter(operator, 99999, "", 0); return err }()))
	assert.Equal(t, errPromoterShareRate, messageKey(t, func() error { _, err := SetPromoter(operator, promoterUser.Id, "", 100.5); return err }()))
	promoter, err := SetPromoter(operator, promoterUser.Id, " 线下渠道 ", 20.125)
	require.NoError(t, err)
	assert.Equal(t, "线下渠道", promoter.Remark)
	assert.Equal(t, 20.13, promoter.ShareRate, "share rate keeps two decimals")
	assert.Equal(t, errPromoterExists, messageKey(t, func() error { _, err := SetPromoter(operator, promoterUser.Id, "", 0); return err }()))
	otherPromoter, err := SetPromoter(operator, otherPromoterUser.Id, "", 0)
	require.NoError(t, err)

	// 修改备注与分成比例：越界拒绝、成功后库里与内存对象一致
	assert.Equal(t, errPromoterShareRate, messageKey(t, UpdatePromoter(promoter, "x", -1)))
	require.NoError(t, UpdatePromoter(promoter, " 新备注 ", 15))
	stored, err := model.GetActivePromoterById(promoter.Id)
	require.NoError(t, err)
	assert.Equal(t, "新备注", stored.Remark)
	assert.Equal(t, float64(15), stored.ShareRate)
	assert.Equal(t, float64(15), promoter.ShareRate)

	// 批量绑定：自己 / 管理员 / 不存在 失败，alice 成功，同一批重复输入只算一次；不含历史 → usage_since > 0
	before := common.GetTimestamp()
	result, err := BindUsers(operator, promoterUser.Id, []string{"promo", "admin", "ghost", "alice", "alice", " "}, false)
	require.NoError(t, err)
	require.Len(t, result.Bound, 1)
	assert.Equal(t, alice.Id, result.Bound[0].Id)
	failedKeys := map[string]string{}
	for _, failure := range result.Failed {
		failedKeys[failure.Input] = failure.ReasonKey
	}
	assert.Equal(t, map[string]string{"promo": errPromoterBindSelf, "admin": errPromoterBindAdmin, "ghost": errPromoterUserMissing}, failedKeys)
	binding, err := model.GetActiveBindingByUserId(alice.Id)
	require.NoError(t, err)
	assert.Equal(t, model.PromoterBindingSourceAdmin, binding.Source)
	assert.GreaterOrEqual(t, binding.UsageSince, before)

	// 已在本名下 / 已归属他人
	result, err = BindUsers(operator, promoterUser.Id, []string{"alice"}, false)
	require.NoError(t, err)
	require.Len(t, result.Failed, 1)
	assert.Equal(t, errPromoterBindSame, result.Failed[0].ReasonKey)
	result, err = BindUsers(operator, otherPromoterUser.Id, []string{common.Interface2String(alice.Id)}, true)
	require.NoError(t, err)
	require.Len(t, result.Failed, 1)
	assert.Equal(t, errPromoterBindOther, result.Failed[0].ReasonKey)
	assert.Equal(t, "promo", result.Failed[0].ReasonParams["promoter"])

	// 含历史 → usage_since = 0；数字 ID 输入
	result, err = BindUsers(operator, promoterUser.Id, []string{common.Interface2String(bob.Id)}, true)
	require.NoError(t, err)
	require.Len(t, result.Bound, 1)
	binding, err = model.GetActiveBindingByUserId(bob.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(0), binding.UsageSince)

	// 批量上限
	tooMany := make([]string, PromoterBatchBindMax+1)
	_, err = BindUsers(operator, promoterUser.Id, tooMany, false)
	assert.Equal(t, errPromoterBatchTooLarge, messageKey(t, err))

	// 解绑 → 再解绑报错 → 解绑后可以再绑（部分唯一索引只约束活跃绑定）
	require.NoError(t, UnbindUser(operator, promoterUser.Id, alice.Id))
	assert.Equal(t, errPromoterBindingNotFnd, messageKey(t, UnbindUser(operator, promoterUser.Id, alice.Id)))
	result, err = BindUsers(operator, otherPromoterUser.Id, []string{"alice"}, false)
	require.NoError(t, err)
	require.Len(t, result.Bound, 1)
	var historyRows int64
	require.NoError(t, model.DB.Model(&model.PromoterBinding{}).Where("user_id = ?", alice.Id).Count(&historyRows).Error)
	assert.Equal(t, int64(2), historyRows, "unbind keeps history rows")

	// 移除推广人：级联解绑名下用户，之后可重新设为推广人
	unbound, err := UnsetPromoter(operator, promoter)
	require.NoError(t, err)
	assert.Equal(t, int64(1), unbound) // bob
	_, err = model.GetActivePromoterByUserId(promoterUser.Id)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = model.GetActiveBindingByUserId(bob.Id)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	_, err = SetPromoter(operator, promoterUser.Id, "again", 0)
	require.NoError(t, err)
	assert.Equal(t, errPromoterNotFound, messageKey(t, UpdatePromoter(promoter, "stale", 1)), "removed promoter cannot be updated")
	_ = otherPromoter
}

func TestBindPromoterOnRegister(t *testing.T) {
	setupPromoterPostgres(t)
	promoterUser := newPromoterTestUser(t, "promo", common.RoleCommonUser)
	plainInviter := newPromoterTestUser(t, "plain", common.RoleCommonUser)
	_, err := SetPromoter(1, promoterUser.Id, "", 0)
	require.NoError(t, err)

	// 邀请人不是推广人：不绑
	u1 := newPromoterTestUser(t, "u1", common.RoleCommonUser)
	model.BindPromoterOnRegister(plainInviter.Id, u1.Id)
	_, err = model.GetActiveBindingByUserId(u1.Id)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)

	// 邀请人是推广人：全历史口径的 register 绑定；重复调用不覆盖
	u2 := newPromoterTestUser(t, "u2", common.RoleCommonUser)
	model.BindPromoterOnRegister(promoterUser.Id, u2.Id)
	model.BindPromoterOnRegister(promoterUser.Id, u2.Id)
	binding, err := model.GetActiveBindingByUserId(u2.Id)
	require.NoError(t, err)
	assert.Equal(t, model.PromoterBindingSourceRegister, binding.Source)
	assert.Equal(t, int64(0), binding.UsageSince)
	assert.Equal(t, promoterUser.Id, binding.PromoterUserId)

	// 真实注册路径：User.Insert(inviterId) 触发钩子，且不依赖支付合规开关（测试环境默认未确认）
	newUser := &model.User{Username: "viaaff", Password: "password123", DisplayName: "viaaff", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
	require.NoError(t, newUser.Insert(promoterUser.Id))
	binding, err = model.GetActiveBindingByUserId(newUser.Id)
	require.NoError(t, err)
	assert.Equal(t, model.PromoterBindingSourceRegister, binding.Source)
}

func TestPromoterCenterStats(t *testing.T) {
	setupPromoterPostgres(t)
	loc := model.BillingLocation()
	day := func(d int, hour int) int64 { return time.Date(2026, 3, 10+d, hour, 0, 0, 0, loc).Unix() }
	promoterUser := newPromoterTestUser(t, "promo", common.RoleCommonUser)
	alice := newPromoterTestUser(t, "alice", common.RoleCommonUser)
	carol := newPromoterTestUser(t, "carol", common.RoleCommonUser) // 企业主账号
	dave := newPromoterTestUser(t, "dave", common.RoleCommonUser)   // 0 消耗
	eve := newPromoterTestUser(t, "eve", common.RoleCommonUser)     // usage_since 在区间中间
	outsider := newPromoterTestUser(t, "outsider", common.RoleCommonUser)
	require.NoError(t, model.DB.Create(&model.Enterprise{UserId: carol.Id, Name: "Carol Inc", BillingMode: "prepaid", Currency: "USD"}).Error)
	promoter, err := SetPromoter(1, promoterUser.Id, "", 0)
	require.NoError(t, err)

	logAt := func(user *model.User, logType int, modelName string, quota int, prompt int, completion int, at int64) {
		require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: user.Id, Username: user.Username, Type: logType, ModelName: modelName, Group: "default", Quota: quota, PromptTokens: prompt, CompletionTokens: completion, CreatedAt: at}).Error)
	}
	// 三天：03-10 / 03-11 / 03-12
	for d := range 3 {
		logAt(alice, model.LogTypeConsume, "gpt-4o", 1000, 100, 50, day(d, 9))
		logAt(alice, model.LogTypeRefund, "gpt-4o", 100, 0, 0, day(d, 10))
		logAt(carol, model.LogTypeConsume, "claude-3", 500, 10, 5, day(d, 11))
		logAt(eve, model.LogTypeConsume, "gpt-4o", 200, 20, 10, day(d, 12))
		logAt(outsider, model.LogTypeConsume, "gpt-4o", 9999, 1, 1, day(d, 13))
	}
	// 绑定：alice / carol / dave 全历史，eve 从 03-11 起
	bindAll := func(user *model.User, usageSince int64) {
		require.NoError(t, model.CreatePromoterBinding(&model.PromoterBinding{PromoterUserId: promoterUser.Id, UserId: user.Id, Source: model.PromoterBindingSourceAdmin, BoundBy: 1, BoundAt: day(0, 0), UsageSince: usageSince}))
	}
	bindAll(alice, 0)
	bindAll(carol, 0)
	bindAll(dave, 0)
	bindAll(eve, day(1, 15))
	// 前两天走预聚合、第三天走实时
	for _, d := range []string{"2026-03-10", "2026-03-11"} {
		_, err := model.RollupLogDay(d)
		require.NoError(t, err)
	}
	require.NoError(t, model.SetLogRollupCursor("2026-03-11"))
	r, err := model.ParseFinanceDayRange("2026-03-09", "2026-03-12")
	require.NoError(t, err)

	overview, err := GetPromoterCenterOverview(promoter, r)
	require.NoError(t, err)
	assert.Equal(t, "promo", overview.Promoter.AffCode)
	assert.Equal(t, 4, overview.Summary.BoundUserCount)
	assert.Equal(t, 3, overview.Summary.ActiveUserCount) // alice / carol / eve（dave 无消耗）
	// alice 净 900×3 + carol 500×3 + eve 200×2（03-10 被 usage_since 截掉）
	assert.Equal(t, int64(2700+1500+400), overview.Summary.NetQuota)
	assert.Equal(t, int64(3+3+2), overview.Summary.RequestCount)
	assert.Equal(t, int64((100+50)*3+(10+5)*3+(20+10)*2), overview.Summary.TotalTokens)
	require.Len(t, overview.Daily, 4)
	assert.Equal(t, "2026-03-09", overview.Daily[0].Day)
	assert.Equal(t, int64(0), overview.Daily[0].NetQuota)
	assert.Equal(t, int64(900+500), overview.Daily[1].NetQuota)
	assert.Equal(t, int64(900+500+200), overview.Daily[2].NetQuota)
	assert.Equal(t, int64(900+500+200), overview.Daily[3].NetQuota)

	users, err := ListPromoterCenterUsers(promoter, r, false)
	require.NoError(t, err)
	require.Len(t, users, 4)
	assert.Equal(t, []string{"alice", "carol", "eve", "dave"}, []string{users[0].Username, users[1].Username, users[2].Username, users[3].Username})
	assert.True(t, users[1].IsEnterprise)
	assert.Equal(t, "2026-03-12", users[0].LastConsumeDay)
	assert.Equal(t, "", users[3].LastConsumeDay)
	assert.Equal(t, int64(0), users[3].NetQuota)
	assert.Empty(t, users[0].Email, "self view must not expose email")
	assert.Empty(t, users[0].Group, "self view must not expose group")
	adminUsers, err := ListPromoterCenterUsers(promoter, r, true)
	require.NoError(t, err)
	assert.Equal(t, "default", adminUsers[0].Group)

	models, err := ListPromoterCenterModels(promoter, r)
	require.NoError(t, err)
	require.Len(t, models.Items, 2)
	assert.Equal(t, "gpt-4o", models.Items[0].ModelName)
	assert.Equal(t, int64(2700+400), models.Items[0].NetQuota)
	assert.Equal(t, "claude-3", models.Items[1].ModelName)
	assert.InDelta(t, 100, models.Items[0].Percentage+models.Items[1].Percentage, 0.02)

	usage, err := GetPromoterCenterUserUsage(promoter, eve.Id, r)
	require.NoError(t, err)
	assert.Equal(t, int64(400), usage.Summary.NetQuota)
	assert.Equal(t, "eve", usage.User.Username)
	_, err = GetPromoterCenterUserUsage(promoter, outsider.Id, r)
	assert.ErrorIs(t, err, ErrPromoterUserNotBound)

	// 管理端按推广人归并
	byPromoter, err := PromoterNetQuotaByPromoter([]int{promoterUser.Id, 424242}, r)
	require.NoError(t, err)
	assert.Equal(t, map[int]int64{promoterUser.Id: 2700 + 1500 + 400}, byPromoter)
}

func TestPromoterSettlementMonths(t *testing.T) {
	setupPromoterPostgres(t)
	loc := model.BillingLocation()
	at := func(month time.Month, day int, hour int) int64 {
		return time.Date(2026, month, day, hour, 0, 0, 0, loc).Unix()
	}
	admin := newPromoterTestUser(t, "admin", common.RoleAdminUser)
	promoterUser := newPromoterTestUser(t, "promo", common.RoleCommonUser)
	alice := newPromoterTestUser(t, "alice", common.RoleCommonUser) // 预付用户
	carol := newPromoterTestUser(t, "carol", common.RoleCommonUser) // 授信企业主账号
	eve := newPromoterTestUser(t, "eve", common.RoleCommonUser)     // usage_since 在 3 月中间
	dave := newPromoterTestUser(t, "dave", common.RoleCommonUser)   // 0 消耗
	promoter, err := SetPromoter(admin.Id, promoterUser.Id, "", 20)
	require.NoError(t, err)

	// 授信企业 carol：账期 A（2 月，已出账已付）/ B（3-01～3-11，已出账已核销）/ C（3-11 起，进行中）
	enterprise := &model.Enterprise{UserId: carol.Id, Name: "Carol Inc", BillingMode: model.EnterpriseBillingModeCredit, Currency: "USD"}
	require.NoError(t, model.DB.Create(enterprise).Error)
	newBill := func(no string, periodId int64, status string) int64 {
		bill := &model.EnterpriseBill{BillNo: no, EnterpriseId: enterprise.Id, PeriodId: periodId, BillType: model.EnterpriseBillTypeCredit, Status: status, IssuedAt: at(time.March, 1, 0), CreatedAt: 1, UpdatedAt: 1}
		require.NoError(t, model.DB.Create(bill).Error)
		return bill.Id
	}
	newPeriod := func(no int, start int64, end int64, status string) *model.EnterpriseCreditPeriod {
		period := &model.EnterpriseCreditPeriod{EnterpriseId: enterprise.Id, PeriodNo: no, StartAt: start, EndAt: end, Status: status, LimitQuota: 1, CreatedAt: 1, UpdatedAt: 1}
		require.NoError(t, model.DB.Create(period).Error)
		return period
	}
	periodA := newPeriod(1, at(time.February, 1, 0), at(time.March, 1, 0), model.EnterpriseCreditPeriodBilled)
	periodB := newPeriod(2, at(time.March, 1, 0), at(time.March, 11, 0), model.EnterpriseCreditPeriodBilled)
	newPeriod(3, at(time.March, 11, 0), at(time.April, 1, 0), model.EnterpriseCreditPeriodOpen)
	require.NoError(t, model.DB.Model(periodA).Update("bill_id", newBill("B-A", periodA.Id, model.EnterpriseBillPaid)).Error)
	require.NoError(t, model.DB.Model(periodB).Update("bill_id", newBill("B-B", periodB.Id, model.EnterpriseBillVoid)).Error)

	logAt := func(user *model.User, logType int, quota int, ts int64) {
		require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: user.Id, Username: user.Username, Type: logType, ModelName: "gpt-4o", Group: "default", Quota: quota, PromptTokens: 10, CompletionTokens: 5, CreatedAt: ts}).Error)
	}
	// 2-28、3-10、3-11、3-12 四天
	for _, day := range []int64{at(time.February, 28, 9), at(time.March, 10, 9), at(time.March, 11, 9), at(time.March, 12, 9)} {
		logAt(alice, model.LogTypeConsume, 1000, day)
		logAt(alice, model.LogTypeRefund, 100, day+60)
		logAt(carol, model.LogTypeConsume, 500, day+120)
		logAt(eve, model.LogTypeConsume, 200, day+180)
	}
	bind := func(user *model.User, usageSince int64) {
		require.NoError(t, model.CreatePromoterBinding(&model.PromoterBinding{PromoterUserId: promoterUser.Id, UserId: user.Id, Source: model.PromoterBindingSourceAdmin, BoundBy: admin.Id, BoundAt: at(time.March, 5, 0), UsageSince: usageSince}))
	}
	bind(alice, 0)
	bind(carol, 0)
	bind(dave, 0)
	bind(eve, at(time.March, 11, 15))
	// 2-28 / 3-10 走预聚合，之后实时
	for _, day := range []string{"2026-02-28", "2026-03-10"} {
		_, err := model.RollupLogDay(day)
		require.NoError(t, err)
	}
	require.NoError(t, model.SetLogRollupCursor("2026-03-10"))

	// 月份工具
	r, err := model.ParseFinanceDayRange("2026-02-20", "2026-03-12")
	require.NoError(t, err)
	assert.Equal(t, []string{"2026-03", "2026-02"}, PromoterMonthsInRange(r))
	assert.Equal(t, []string{"2026-04", "2026-03"}, PromoterAllMonths(at(time.March, 5, 0), time.Date(2026, 4, 15, 0, 0, 0, 0, loc)))
	assert.Equal(t, []string{"2026-03"}, PromoterAllMonths(at(time.March, 5, 0), time.Date(2026, 3, 20, 0, 0, 0, 0, loc)))

	// 推广人视图：3 月未结束 → 不可结算；核销数不下发
	months, err := ListPromoterSettlementMonths(promoter, PromoterMonthsInRange(r), time.Date(2026, 3, 20, 0, 0, 0, 0, loc), false)
	require.NoError(t, err)
	require.Len(t, months, 2)
	march, feb := months[0], months[1]
	assert.Equal(t, "2026-03", march.Month)
	assert.False(t, march.Settleable)
	assert.True(t, feb.Settleable)
	// 3 月：alice 900×3 + carol 500×3 + eve 200×2（3-10 被 usage_since 截掉）
	assert.Equal(t, int64(2700+1500+400), march.NetQuota)
	assert.Equal(t, int64(0), march.CreditPaidQuota)
	assert.Equal(t, int64(1500), march.CreditUnpaidQuota, "B 已核销 500 + C 进行中 1000 都算待回款")
	assert.Equal(t, int64(0), march.CreditVoidQuota, "self view hides the void split")
	// 2 月：alice 900 + carol 500（A 已付）；eve 被截掉
	assert.Equal(t, int64(900+500), feb.NetQuota)
	assert.Equal(t, int64(500), feb.CreditPaidQuota)
	assert.Equal(t, int64(0), feb.CreditUnpaidQuota)
	// 与推广中心同月区间的净消耗一致，用户子行之和等于月合计
	marchRange, err := PromoterSettlementMonthRange("2026-03")
	require.NoError(t, err)
	overview, err := GetPromoterCenterOverview(promoter, marchRange)
	require.NoError(t, err)
	assert.Equal(t, overview.Summary.NetQuota, march.NetQuota)
	require.Len(t, march.Users, 3)
	assert.Equal(t, []string{"alice", "carol", "eve"}, []string{march.Users[0].Username, march.Users[1].Username, march.Users[2].Username})
	var usersNet int64
	for _, user := range march.Users {
		usersNet += user.NetQuota
	}
	assert.Equal(t, march.NetQuota, usersNet)
	assert.False(t, march.Users[0].HasCredit)
	assert.True(t, march.Users[1].HasCredit)
	assert.True(t, march.Users[1].IsEnterprise)
	assert.Equal(t, int64(1500), march.Users[1].CreditUnpaidQuota)

	// 管理员视图看到核销数
	adminMonths, err := ListPromoterSettlementMonths(promoter, []string{"2026-03"}, time.Date(2026, 4, 15, 0, 0, 0, 0, loc), true)
	require.NoError(t, err)
	assert.Equal(t, int64(500), adminMonths[0].CreditVoidQuota)
	assert.True(t, adminMonths[0].Settleable)

	// 标记：非法月份 / 当前月 / 负金额 拒绝；成功后快照正确；重复标记报已结算
	now := time.Date(2026, 4, 15, 10, 0, 0, 0, loc)
	assert.Equal(t, errPromoterMonthInvalid, messageKey(t, func() error {
		_, err := MarkPromoterSettled(admin.Id, promoter, "2026-3", decimal.NullDecimal{}, "", "", now)
		return err
	}()))
	assert.Equal(t, errPromoterMonthNotSettleable, messageKey(t, func() error {
		_, err := MarkPromoterSettled(admin.Id, promoter, "2026-04", decimal.NullDecimal{}, "", "", now)
		return err
	}()))
	assert.Equal(t, errPromoterAmountNegative, messageKey(t, func() error {
		_, err := MarkPromoterSettled(admin.Id, promoter, "2026-03", decimal.NewNullDecimal(decimal.NewFromInt(-1)), "", "", now)
		return err
	}()))
	settled, err := MarkPromoterSettled(admin.Id, promoter, "2026-03", decimal.NewNullDecimal(decimal.NewFromFloat(61.5)), " TX-1 ", " note ", now)
	require.NoError(t, err)
	assert.Equal(t, int64(4600), settled.NetQuotaSnapshot)
	assert.Equal(t, int64(1500), settled.CreditUnpaidSnapshot)
	assert.Equal(t, float64(20), settled.ShareRateSnapshot)
	assert.Equal(t, "TX-1", settled.Reference)
	assert.Equal(t, "note", settled.Remark)
	assert.Equal(t, errPromoterMonthSettled, messageKey(t, func() error {
		_, err := MarkPromoterSettled(admin.Id, promoter, "2026-03", decimal.NullDecimal{}, "", "", now)
		return err
	}()))

	// 列表：已结算；推广人视图不带流水号 / 操作人，管理员视图带
	months, err = ListPromoterSettlementMonths(promoter, []string{"2026-03"}, now, false)
	require.NoError(t, err)
	require.True(t, months[0].Settled)
	require.NotNil(t, months[0].Settlement)
	assert.True(t, months[0].Settlement.AmountUSD.Decimal.Equal(decimal.NewFromFloat(61.5)))
	assert.Equal(t, "note", months[0].Settlement.Remark)
	assert.Empty(t, months[0].Settlement.Reference)
	assert.Empty(t, months[0].Settlement.SettledByUsername)
	adminMonths, err = ListPromoterSettlementMonths(promoter, []string{"2026-03"}, now, true)
	require.NoError(t, err)
	assert.Equal(t, "TX-1", adminMonths[0].Settlement.Reference)
	assert.Equal(t, "admin", adminMonths[0].Settlement.SettledByUsername)

	// 撤销：回到待结算，记录留痕；再撤销报无记录；再次标记插入新行
	require.NoError(t, RevertPromoterSettlement(admin.Id, promoter, "2026-03", now))
	months, err = ListPromoterSettlementMonths(promoter, []string{"2026-03"}, now, false)
	require.NoError(t, err)
	assert.False(t, months[0].Settled)
	assert.Equal(t, errPromoterSettlementMissing, messageKey(t, RevertPromoterSettlement(admin.Id, promoter, "2026-03", now)))
	again, err := MarkPromoterSettled(admin.Id, promoter, "2026-03", decimal.NullDecimal{}, "", "", now)
	require.NoError(t, err)
	assert.NotEqual(t, settled.Id, again.Id)
	var historyRows int64
	require.NoError(t, model.DB.Model(&model.PromoterSettlement{}).Where("promoter_user_id = ? AND month = ?", promoterUser.Id, "2026-03").Count(&historyRows).Error)
	assert.Equal(t, int64(2), historyRows, "revert keeps the old row")
}
