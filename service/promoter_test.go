package service

import (
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
	tables := []any{&model.User{}, &model.Log{}, &model.Option{}, &model.Enterprise{}, &model.LogDailyRollup{}, &model.Promoter{}, &model.PromoterBinding{}}
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
	assert.Equal(t, errPromoterAdmin, messageKey(t, func() error { _, err := SetPromoter(operator, admin.Id, ""); return err }()))
	assert.Equal(t, errPromoterUserMissing, messageKey(t, func() error { _, err := SetPromoter(operator, 99999, ""); return err }()))
	promoter, err := SetPromoter(operator, promoterUser.Id, " 线下渠道 ")
	require.NoError(t, err)
	assert.Equal(t, "线下渠道", promoter.Remark)
	assert.Equal(t, errPromoterExists, messageKey(t, func() error { _, err := SetPromoter(operator, promoterUser.Id, ""); return err }()))
	otherPromoter, err := SetPromoter(operator, otherPromoterUser.Id, "")
	require.NoError(t, err)

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
	_, err = SetPromoter(operator, promoterUser.Id, "again")
	require.NoError(t, err)
	_ = otherPromoter
}

func TestBindPromoterOnRegister(t *testing.T) {
	setupPromoterPostgres(t)
	promoterUser := newPromoterTestUser(t, "promo", common.RoleCommonUser)
	plainInviter := newPromoterTestUser(t, "plain", common.RoleCommonUser)
	_, err := SetPromoter(1, promoterUser.Id, "")
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
	promoter, err := SetPromoter(1, promoterUser.Id, "")
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
