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
	tables := []any{&model.User{}, &model.Token{}, &model.Enterprise{}, &model.EnterpriseCreditPeriod{}, &model.EnterpriseCreditNotifyRecord{}, &model.EnterpriseLedgerEntry{}}
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
