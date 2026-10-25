package service

import (
	"net/http/httptest"
	"os"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 授信计费只支持 PostgreSQL，测试必须跑在真实 PG 上
func setupCreditFundingPostgres(t *testing.T) {
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
		&model.User{}, &model.Token{}, &model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{}, &model.EnterpriseTokenAssignment{},
		&model.EnterpriseCreditPeriod{}, &model.EnterpriseCreditNotifyRecord{}, &model.EnterpriseLedgerEntry{},
		// 出账测试需要明细聚合与账单表；团队预算测试需要通知记录表
		&model.EnterpriseUsageDaily{}, &model.EnterpriseBill{}, &model.EnterpriseTeamBudgetNotify{},
	}
	previousDB := model.DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB = previousDB
		common.SetDatabaseTypes(previousMain, previousLog)
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
}

func newCreditTestContext() *gin.Context {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	return c
}

func newCreditEnterprise(t *testing.T, username string, mode string) (*model.User, *model.Enterprise) {
	t.Helper()
	user := &model.User{Username: username, Password: "password123", DisplayName: username, Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Quota: 300, AffCode: username}
	require.NoError(t, model.DB.Create(user).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(user.Id, &model.Enterprise{Name: username + " Co"}))
	if mode == model.EnterpriseBillingModeCredit {
		require.NoError(t, model.ConfigureEnterpriseCredit(mustEnterprise(t, user.Id).Id, model.EnterpriseCreditConfig{CycleType: model.EnterpriseCreditCycleNaturalMonth, LimitQuota: 1000}, 1))
	}
	// 企业计费信息按 user_id 做进程内缓存（15s）：用例结束必须清掉，否则同包后续 sqlite 用例里同 id 的用户会命中这里的授信态
	model.InvalidateEnterpriseBillingInfo(user.Id)
	t.Cleanup(func() { model.InvalidateEnterpriseBillingInfo(user.Id) })
	return user, mustEnterprise(t, user.Id)
}

func mustEnterprise(t *testing.T, userId int) *model.Enterprise {
	t.Helper()
	enterprise, err := model.GetEnterpriseByUserId(userId)
	require.NoError(t, err)
	return enterprise
}

func creditPeriodState(t *testing.T, enterpriseId int) (int64, int) {
	t.Helper()
	period, err := model.GetOpenCreditPeriod(enterpriseId)
	require.NoError(t, err)
	return period.UsedQuota, period.InflightCount
}

func TestBillingSessionCreditLifecycle(t *testing.T) {
	setupCreditFundingPostgres(t)
	owner, ent := newCreditEnterprise(t, "creditflow", model.EnterpriseBillingModeCredit)
	relayInfo := func() *relaycommon.RelayInfo {
		return &relaycommon.RelayInfo{UserId: owner.Id, IsPlayground: true, RequestId: "req"}
	}

	// 预扣 → 结算补扣：差额记回同一账期，在途归零；钱包余额不受影响
	info := relayInfo()
	session, apiErr := NewBillingSession(newCreditTestContext(), info, 400)
	require.Nil(t, apiErr)
	assert.Equal(t, BillingSourceCredit, info.BillingSource)
	assert.NotZero(t, info.CreditPeriodId)
	used, inflight := creditPeriodState(t, ent.Id)
	assert.Equal(t, int64(400), used)
	assert.Equal(t, 1, inflight)
	require.NoError(t, session.Settle(450))
	used, inflight = creditPeriodState(t, ent.Id)
	assert.Equal(t, int64(450), used)
	assert.Equal(t, 0, inflight)
	assert.False(t, session.NeedsRefund())

	// 差额为 0 时也释放在途
	info = relayInfo()
	session, apiErr = NewBillingSession(newCreditTestContext(), info, 100)
	require.Nil(t, apiErr)
	require.NoError(t, session.Settle(100))
	used, inflight = creditPeriodState(t, ent.Id)
	assert.Equal(t, int64(550), used)
	assert.Equal(t, 0, inflight)

	// 请求失败退款：预扣全部返还，在途归零
	info = relayInfo()
	session, apiErr = NewBillingSession(newCreditTestContext(), info, 200)
	require.Nil(t, apiErr)
	assert.True(t, session.NeedsRefund())
	require.NoError(t, session.funding.Refund())
	used, _ = creditPeriodState(t, ent.Id)
	assert.Equal(t, int64(550), used)
	_, err := model.ApplyCreditSettlement(ent.Id, info.CreditPeriodId, 0, 0)
	require.NoError(t, err)

	// 超出本期额度：403 额度不足，不产生任何扣减
	info = relayInfo()
	_, apiErr = NewBillingSession(newCreditTestContext(), info, 500)
	require.NotNil(t, apiErr)
	assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
	assert.Equal(t, 403, apiErr.StatusCode)
	used, inflight = creditPeriodState(t, ent.Id)
	assert.Equal(t, int64(550), used)
	assert.Equal(t, 0, inflight)
	quota, err := model.GetUserQuota(owner.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 300, quota, "credit never touches the wallet balance")

	// 管理员上调额度后立即可用；停用企业后直接拒绝
	require.NoError(t, model.ConfigureEnterpriseCredit(ent.Id, model.EnterpriseCreditConfig{CycleType: model.EnterpriseCreditCycleNaturalMonth, LimitQuota: 5000}, 1))
	info = relayInfo()
	session, apiErr = NewBillingSession(newCreditTestContext(), info, 500)
	require.Nil(t, apiErr)
	require.NoError(t, session.Settle(500))
	require.NoError(t, model.SetEnterpriseStatus(ent.Id, model.EnterpriseStatusSuspended))
	_, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 1)
	require.NotNil(t, apiErr)
	assert.Equal(t, 403, apiErr.StatusCode)
}

func TestBillingSessionPrepaidEnterpriseUsesWallet(t *testing.T) {
	setupCreditFundingPostgres(t)
	owner, _ := newCreditEnterprise(t, "prepaidflow", model.EnterpriseBillingModePrepaid)
	info := &relaycommon.RelayInfo{UserId: owner.Id, IsPlayground: true, RequestId: "req"}
	session, apiErr := NewBillingSession(newCreditTestContext(), info, 100)
	require.Nil(t, apiErr)
	assert.Equal(t, BillingSourceWallet, info.BillingSource)
	require.NoError(t, session.Settle(120))
	quota, err := model.GetUserQuota(owner.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 180, quota)
}

// 团队预算拦截：勾了「超限拦截」的团队在本月消耗 + 预估预扣 > 预算 时预扣前 403；其他团队不受影响；关掉开关立即放行；
// 本月消耗走 60 秒缓存，窗口内的略超被接受
func TestBillingSessionTeamBudgetEnforce(t *testing.T) {
	setupCreditFundingPostgres(t)
	owner, ent := newCreditEnterprise(t, "budgetgate", model.EnterpriseBillingModePrepaid)
	research := &model.EnterpriseTeam{EnterpriseId: ent.Id, Name: "Research", MonthlyBudgetQuota: 1000, BudgetAlertPercent: 80, BudgetEnforce: true}
	require.NoError(t, model.CreateEnterpriseTeam(research))
	sales := &model.EnterpriseTeam{EnterpriseId: ent.Id, Name: "Sales"}
	require.NoError(t, model.CreateEnterpriseTeam(sales))
	researchKey := &model.Token{UserId: owner.Id, Name: "research", Key: "researchkey0000000000000000000000000000000000001", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, model.CreateEnterpriseToken(ent.Id, model.EnterpriseScope{}, researchKey, research.Id, 0))
	salesKey := &model.Token{UserId: owner.Id, Name: "sales", Key: "saleskey000000000000000000000000000000000000001", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, model.CreateEnterpriseToken(ent.Id, model.EnterpriseScope{}, salesKey, sales.Id, 0))
	model.InvalidateEnterpriseBillingInfo(owner.Id)
	model.InvalidateAllTokenAttribution()
	model.InvalidateTeamMonthUsage(research.Id)

	var alerts []model.TeamBudgetAlert
	previousDispatch, previousNotify := teamBudgetAlertDispatch, teamBudgetAlertNotify
	teamBudgetAlertDispatch = func(task func()) { task() }
	teamBudgetAlertNotify = func(alert model.TeamBudgetAlert) { alerts = append(alerts, alert) }
	t.Cleanup(func() { teamBudgetAlertDispatch, teamBudgetAlertNotify = previousDispatch, previousNotify })

	// 本月已消耗 950（跨过 80% 阈值，warn 由聚合路径发出）
	require.NoError(t, model.RecordEnterpriseUsage(model.EnterpriseUsageEvent{UserId: owner.Id, TokenId: researchKey.Id, ModelName: "gpt-4o", Quota: 950, CreatedAt: common.GetTimestamp()}))
	require.Len(t, alerts, 1)
	assert.Equal(t, model.TeamBudgetKindWarn, alerts[0].Kind)

	relayFor := func(token *model.Token) *relaycommon.RelayInfo {
		return &relaycommon.RelayInfo{UserId: owner.Id, TokenId: token.Id, IsPlayground: true, RequestId: "req"}
	}
	// 950 + 100 > 1000：预扣前 403，钱包未动，并按「用尽」通知一次
	_, apiErr := NewBillingSession(newCreditTestContext(), relayFor(researchKey), 100)
	require.NotNil(t, apiErr)
	assert.Equal(t, 403, apiErr.StatusCode)
	assert.Equal(t, ErrorCodeTeamBudgetExceeded, apiErr.GetErrorCode())
	walletQuota, err := model.GetUserQuota(owner.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 300, walletQuota)
	require.Len(t, alerts, 2)
	assert.Equal(t, model.TeamBudgetKindExceeded, alerts[1].Kind)
	_, apiErr = NewBillingSession(newCreditTestContext(), relayFor(researchKey), 100)
	require.NotNil(t, apiErr)
	assert.Len(t, alerts, 2, "exceeded is sent once per team per month")

	// 预算内的请求放行；没有预算的团队不受影响
	session, apiErr := NewBillingSession(newCreditTestContext(), relayFor(researchKey), 50)
	require.Nil(t, apiErr)
	assert.Equal(t, BillingSourceWallet, session.relayInfo.BillingSource)
	session.Refund(newCreditTestContext())
	_, apiErr = NewBillingSession(newCreditTestContext(), relayFor(salesKey), 100)
	require.Nil(t, apiErr)

	// 其他副本写入的用量（不经过本节点缓存）在 60 秒窗口内看不到：略超被接受；缓存失效后立即拦截
	require.NoError(t, model.DB.Model(&model.EnterpriseUsageDaily{}).Where("team_id = ?", research.Id).Update("quota", 1200).Error)
	_, apiErr = NewBillingSession(newCreditTestContext(), relayFor(researchKey), 50)
	require.Nil(t, apiErr)
	model.InvalidateTeamMonthUsage(research.Id)
	_, apiErr = NewBillingSession(newCreditTestContext(), relayFor(researchKey), 1)
	require.NotNil(t, apiErr)
	assert.Equal(t, ErrorCodeTeamBudgetExceeded, apiErr.GetErrorCode())

	// 关掉拦截：只告警不拦截，立即放行
	research.BudgetEnforce = false
	require.NoError(t, model.UpdateEnterpriseTeam(research))
	_, apiErr = NewBillingSession(newCreditTestContext(), relayFor(researchKey), 100)
	require.Nil(t, apiErr)
}

// creditAlertRecorder 把预警发送换成同步记录，用例结束后恢复并清掉进程内已发标记
type creditAlertRecorder struct {
	mu    sync.Mutex
	kinds []string
}

func (r *creditAlertRecorder) install(t *testing.T) {
	t.Helper()
	previousNotify, previousDispatch := creditAlertNotify, creditAlertDispatch
	creditAlertDispatch = func(task func()) { task() }
	creditAlertNotify = func(_ int, _ model.CreditUsageState, kind string, _ int) {
		r.mu.Lock()
		defer r.mu.Unlock()
		r.kinds = append(r.kinds, kind)
	}
	t.Cleanup(func() {
		creditAlertNotify, creditAlertDispatch = previousNotify, previousDispatch
		creditAlertSent.Range(func(key, _ any) bool {
			creditAlertSent.Delete(key)
			return true
		})
	})
}

func (r *creditAlertRecorder) snapshot() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.kinds...)
}

func TestCreditFundingAlerts(t *testing.T) {
	setupCreditFundingPostgres(t)
	recorder := &creditAlertRecorder{}
	recorder.install(t)
	owner, ent := newCreditEnterprise(t, "alertflow", model.EnterpriseBillingModeCredit)
	configure := func(limit int64, percent int) {
		t.Helper()
		require.NoError(t, model.ConfigureEnterpriseCredit(ent.Id, model.EnterpriseCreditConfig{CycleType: model.EnterpriseCreditCycleNaturalMonth, LimitQuota: limit, AlertPercent: percent}, 1))
		model.InvalidateEnterpriseBillingInfo(owner.Id)
	}
	configure(1000, 80)
	relayInfo := func() *relaycommon.RelayInfo {
		return &relaycommon.RelayInfo{UserId: owner.Id, IsPlayground: true, RequestId: "req"}
	}
	notifyRecords := func(kind string) int64 {
		t.Helper()
		var count int64
		require.NoError(t, model.DB.Model(&model.EnterpriseCreditNotifyRecord{}).Where("kind = ?", kind).Count(&count).Error)
		return count
	}

	// 70% 不预警；结算到 85% 触发一次 warn；之后继续消费不再重复
	session, apiErr := NewBillingSession(newCreditTestContext(), relayInfo(), 700)
	require.Nil(t, apiErr)
	assert.Empty(t, recorder.snapshot())
	require.NoError(t, session.Settle(850))
	assert.Equal(t, []string{model.CreditNotifyKindWarn}, recorder.snapshot())
	session, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 50)
	require.Nil(t, apiErr)
	require.NoError(t, session.Settle(50))
	assert.Equal(t, []string{model.CreditNotifyKindWarn}, recorder.snapshot(), "warn is sent once per period")
	assert.Equal(t, int64(1), notifyRecords(model.CreditNotifyKindWarn))

	// 预扣被拒（403）直接触发 exhausted，再次被拒不重复
	_, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 500)
	require.NotNil(t, apiErr)
	assert.Equal(t, 403, apiErr.StatusCode)
	_, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 500)
	require.NotNil(t, apiErr)
	assert.Equal(t, []string{model.CreditNotifyKindWarn, model.CreditNotifyKindExhausted}, recorder.snapshot())
	assert.Equal(t, int64(1), notifyRecords(model.CreditNotifyKindExhausted))

	// 额度上调后 warn 记录被清，阈值重新有效；两路并发只有一方抢到发送权
	configure(2000, 80)
	assert.Equal(t, int64(0), notifyRecords(model.CreditNotifyKindWarn))
	period, err := model.GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	funding := &CreditFunding{enterpriseId: ent.Id, periodId: period.Id, alertPercent: 80}
	state := model.CreditUsageState{PeriodId: period.Id, UsedQuota: 1700, LimitQuota: 2000}
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() { funding.checkCreditAlert(state, false) })
	}
	wg.Wait()
	assert.Equal(t, []string{model.CreditNotifyKindWarn, model.CreditNotifyKindExhausted, model.CreditNotifyKindWarn}, recorder.snapshot())
	assert.Equal(t, int64(1), notifyRecords(model.CreditNotifyKindWarn))

	// 阈值 0 关闭预警：即便 403 也不发
	configure(2000, 0)
	_, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 5000)
	require.NotNil(t, apiErr)
	assert.Equal(t, 403, apiErr.StatusCode)
	assert.Len(t, recorder.snapshot(), 3)

	// 滚入新期：按 period_id 隔离，新期达到阈值重新触发
	configure(2000, 80)
	const shift = int64(40 * 86400)
	require.NoError(t, model.DB.Model(&model.Enterprise{}).Where("id = ?", ent.Id).Update("credit_anchor_at", gorm.Expr("credit_anchor_at - ?", shift)).Error)
	require.NoError(t, model.DB.Model(&model.EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{
		"start_at": gorm.Expr("start_at - ?", shift), "end_at": gorm.Expr("end_at - ?", shift),
	}).Error)
	rolled, err := model.RolloverDueCreditPeriods(common.GetTimestamp())
	require.NoError(t, err)
	require.Equal(t, 1, rolled)
	model.InvalidateEnterpriseBillingInfo(owner.Id)
	session, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 1600)
	require.Nil(t, apiErr)
	assert.Len(t, recorder.snapshot(), 4)
	assert.Equal(t, model.CreditNotifyKindWarn, recorder.snapshot()[3])
	require.NoError(t, session.Settle(1600))
	assert.Len(t, recorder.snapshot(), 4)
}

// 额度信用：预扣被拒时用满翻转，新期继续；auto_reset=false 用满后 403 待收款，收款结清自动恢复
func TestCreditFundingQuotaBasedRollover(t *testing.T) {
	setupCreditFundingPostgres(t)
	recorder := &creditAlertRecorder{}
	recorder.install(t)
	// 直接从预付开通额度信用：从自然月改类型时当前时间期会保留到期末（周期类型从下一期生效）
	owner, ent := newCreditEnterprise(t, "quotaflow", model.EnterpriseBillingModePrepaid)
	configure := func(limit int64, autoReset bool) {
		t.Helper()
		require.NoError(t, model.ConfigureEnterpriseCredit(ent.Id, model.EnterpriseCreditConfig{CycleType: model.EnterpriseCreditCycleQuotaBased, LimitQuota: limit, AlertPercent: 80, AutoReset: autoReset}, 1))
		model.InvalidateEnterpriseBillingInfo(owner.Id)
	}
	relayInfo := func() *relaycommon.RelayInfo {
		return &relaycommon.RelayInfo{UserId: owner.Id, IsPlayground: true, RequestId: "req"}
	}
	configure(1000, true)
	first, err := model.GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	assert.Zero(t, first.EndAt)

	// 恰好用满本期：预扣成功并发一次用尽告警；下一笔预扣被拒 → 翻转到新期继续，归属新期
	full, apiErr := NewBillingSession(newCreditTestContext(), relayInfo(), 1000)
	require.Nil(t, apiErr)
	assert.Equal(t, []string{model.CreditNotifyKindExhausted}, recorder.snapshot())
	info := relayInfo()
	session, apiErr := NewBillingSession(newCreditTestContext(), info, 300)
	require.Nil(t, apiErr)
	second, err := model.GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	assert.NotEqual(t, first.Id, second.Id)
	assert.Equal(t, 2, second.PeriodNo)
	assert.Equal(t, second.Id, info.CreditPeriodId)
	assert.Equal(t, int64(300), second.UsedQuota)
	assert.Equal(t, []string{model.CreditNotifyKindExhausted}, recorder.snapshot(), "exhausted is sent once per period")
	closed, err := model.GetCreditPeriodById(first.Id)
	require.NoError(t, err)
	assert.Equal(t, model.EnterpriseCreditPeriodClosing, closed.Status)
	require.NoError(t, session.Settle(300))

	// 旧期的在途请求在翻转后结算：差额记回 closing 期，不影响新期
	require.NoError(t, full.Settle(1050))
	closed, _ = model.GetCreditPeriodById(first.Id)
	assert.Equal(t, int64(1050), closed.UsedQuota)
	assert.Zero(t, closed.InflightCount)
	second, _ = model.GetCreditPeriodById(second.Id)
	assert.Equal(t, int64(300), second.UsedQuota)

	// 单笔请求超过整期额度：有消费的期翻一次，零消费的新期不再翻，403 且不留空期
	_, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 1500)
	require.NotNil(t, apiErr)
	assert.Equal(t, 403, apiErr.StatusCode)
	third, err := model.GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	assert.Equal(t, 3, third.PeriodNo)
	assert.Zero(t, third.UsedQuota)
	_, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 1500)
	require.NotNil(t, apiErr)
	assert.Equal(t, 403, apiErr.StatusCode)
	again, err := model.GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	assert.Equal(t, third.Id, again.Id, "a period without usage is never rolled over")
	assert.Zero(t, again.InflightCount)

	// auto_reset=false：用满后拒绝请求，直到账单结清自动开下一期
	configure(1000, false)
	session, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 1000)
	require.Nil(t, apiErr)
	require.NoError(t, session.Settle(1000))
	for range 2 {
		_, apiErr = NewBillingSession(newCreditTestContext(), relayInfo(), 1)
		require.NotNil(t, apiErr)
		assert.Equal(t, 403, apiErr.StatusCode)
		assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
	}
	_, err = model.GetOpenCreditPeriod(ent.Id)
	assert.ErrorIs(t, err, model.ErrEnterpriseCreditNoOpenPeriod)
	bill, err := model.IssueCreditBill(third.Id)
	require.NoError(t, err)
	require.NotNil(t, bill)
	_, err = model.RegisterBillPayment(bill.Id, bill.TotalUSD, 1, "WIRE", "")
	require.NoError(t, err)
	info = relayInfo()
	session, apiErr = NewBillingSession(newCreditTestContext(), info, 100)
	require.Nil(t, apiErr)
	fourth, err := model.GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	assert.Equal(t, 4, fourth.PeriodNo)
	assert.Equal(t, fourth.Id, info.CreditPeriodId)
	require.NoError(t, session.Settle(100))
}
