package service

import (
	"net/http/httptest"
	"os"
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
	tables := []any{&model.User{}, &model.Token{}, &model.Enterprise{}, &model.EnterpriseCreditPeriod{}, &model.EnterpriseLedgerEntry{}}
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
	model.InvalidateEnterpriseBillingInfo(user.Id)
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
	require.NoError(t, model.ApplyCreditSettlement(ent.Id, info.CreditPeriodId, 0, 0))

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
