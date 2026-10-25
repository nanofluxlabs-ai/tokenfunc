package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 授信额度查询只支持 PostgreSQL（企业模块二开约定），测试跑在真实 PG 上，未配置 DSN 时跳过
func setupCreditBillingPostgres(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, i18n.Init())
	tables := []any{
		&model.User{}, &model.Token{}, &model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{},
		&model.EnterpriseTokenAssignment{}, &model.EnterpriseCreditPeriod{}, &model.EnterpriseCreditNotifyRecord{}, &model.EnterpriseLedgerEntry{},
	}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousRedis, previousTokenStat, previousMaster := common.RedisEnabled, common.DisplayTokenStatEnabled, common.IsMasterNode
	previousDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	// 列名常量（"key" 等）只在 InitDB / InitLogDB 里按数据库类型初始化；LOG_SQL_DSN 为空时 InitLogDB 复用主库并重算列名，
	// 关掉 master 标记避免它顺带跑审计日志迁移
	syncColumnNames := func() {
		common.IsMasterNode = false
		require.NoError(t, model.InitLogDB())
	}
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	syncColumnNames()
	common.RedisEnabled = false
	common.DisplayTokenStatEnabled = false
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB = previousDB
		common.SetDatabaseTypes(previousMain, previousLog)
		syncColumnNames()
		model.LOG_DB = previousLogDB
		common.IsMasterNode = previousMaster
		common.RedisEnabled, common.DisplayTokenStatEnabled = previousRedis, previousTokenStat
		operation_setting.GetGeneralSetting().QuotaDisplayType = previousDisplayType
		model.InvalidateAllTokenAttribution()
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
}

// newCreditBillingRouter 与 router/dashboard.go 一致：三条路由都只经过 API key 鉴权
func newCreditBillingRouter() *gin.Engine {
	engine := gin.New()
	group := engine.Group("/v1/dashboard/billing", middleware.TokenAuth())
	group.GET("/subscription", GetSubscription)
	group.GET("/usage", GetUsage)
	group.GET("/credit", GetCreditBilling)
	return engine
}

func creditBillingRequest(t *testing.T, router http.Handler, path string, key string) (int, map[string]any) {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/v1/dashboard/billing/"+path, nil)
	request.Header.Set("Authorization", "Bearer sk-"+key)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	body := map[string]any{}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body), response.Body.String())
	return response.Code, body
}

func creditBillingErrorCode(body map[string]any) string {
	errorBody, _ := body["error"].(map[string]any)
	code, _ := errorBody["code"].(string)
	return code
}

func newCreditBillingUser(t *testing.T, username string, quota int, usedQuota int) *model.User {
	t.Helper()
	user := &model.User{Username: username, Password: "password123", DisplayName: username, Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", Quota: quota, UsedQuota: usedQuota, AuthVersion: 1, AffCode: username}
	require.NoError(t, model.DB.Create(user).Error)
	// 企业计费信息按 user_id 做进程内缓存，用例结束必须清掉，否则后续 sqlite 用例里同 id 的用户会命中这里的企业态
	model.InvalidateEnterpriseBillingInfo(user.Id)
	t.Cleanup(func() { model.InvalidateEnterpriseBillingInfo(user.Id) })
	return user
}

// newCreditBillingEnterprise 建企业主账号；mode 为 credit 时开通自然月授信 limit=1000
func newCreditBillingEnterprise(t *testing.T, username string, mode string) (*model.User, *model.Enterprise) {
	t.Helper()
	user := newCreditBillingUser(t, username, 300, 50)
	require.NoError(t, model.UpgradeUserToEnterprise(user.Id, &model.Enterprise{Name: username + " Co"}))
	enterprise, err := model.GetEnterpriseByUserId(user.Id)
	require.NoError(t, err)
	if mode == model.EnterpriseBillingModeCredit {
		require.NoError(t, model.ConfigureEnterpriseCredit(enterprise.Id, model.EnterpriseCreditConfig{CycleType: model.EnterpriseCreditCycleNaturalMonth, LimitQuota: 1000}, 1))
	}
	model.InvalidateEnterpriseBillingInfo(user.Id)
	enterprise, err = model.GetEnterpriseByUserId(user.Id)
	require.NoError(t, err)
	return user, enterprise
}

// newCreditBillingKey 建一把主账号持有的 key；teamId 为 0 落默认团队，memberId 非 0 表示分配给成员
func newCreditBillingKey(t *testing.T, user *model.User, enterprise *model.Enterprise, key string, teamId int, memberId int) *model.Token {
	t.Helper()
	token := &model.Token{UserId: user.Id, Key: key, Name: key, Status: common.TokenStatusEnabled, ExpiredTime: -1, RemainQuota: 999999, UsedQuota: 7}
	if enterprise == nil {
		require.NoError(t, model.DB.Create(token).Error)
		return token
	}
	require.NoError(t, model.CreateEnterpriseToken(enterprise.Id, model.EnterpriseScope{}, token, teamId, memberId))
	model.InvalidateTokenAttribution(token.Id)
	return token
}

func TestCreditBillingEndpoints(t *testing.T) {
	setupCreditBillingPostgres(t)
	router := newCreditBillingRouter()
	unit := common.QuotaPerUnit

	t.Run("credit enterprise owner key sees current period", func(t *testing.T) {
		owner, enterprise := newCreditBillingEnterprise(t, "credit-owner", model.EnterpriseBillingModeCredit)
		newCreditBillingKey(t, owner, enterprise, "creditownerkey", 0, 0)
		period, err := model.GetOpenCreditPeriod(enterprise.Id)
		require.NoError(t, err)
		applied, err := model.AddCreditUsage(period.Id, 250, 0, true)
		require.NoError(t, err)
		require.True(t, applied)

		status, body := creditBillingRequest(t, router, "subscription", "creditownerkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.InDelta(t, 1000/unit, body["hard_limit_usd"], 1e-9)
		assert.InDelta(t, 1000/unit, body["soft_limit_usd"], 1e-9)
		assert.InDelta(t, 1000/unit, body["system_hard_limit_usd"], 1e-9)
		assert.EqualValues(t, period.EndAt, body["access_until"])

		status, body = creditBillingRequest(t, router, "usage", "creditownerkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.InDelta(t, 250/unit*100, body["total_usage"], 1e-9)

		status, body = creditBillingRequest(t, router, "credit", "creditownerkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.Equal(t, "billing_credit", body["object"])
		assert.Equal(t, model.EnterpriseBillingModeCredit, body["billing_mode"])
		assert.Equal(t, model.EnterpriseCreditCycleNaturalMonth, body["credit_cycle_type"])
		assert.EqualValues(t, 1, body["period_no"])
		assert.EqualValues(t, period.StartAt, body["period_start"])
		assert.EqualValues(t, period.EndAt, body["period_end"])
		assert.EqualValues(t, 1000, body["limit_quota"])
		assert.EqualValues(t, 250, body["used_quota"])
		assert.EqualValues(t, 750, body["available_quota"])
		assert.InDelta(t, 750/unit, body["available"], 1e-9)
		assert.Equal(t, operation_setting.QuotaDisplayTypeUSD, body["quota_display_type"])
		assert.Equal(t, model.EnterpriseDefaultCurrency, body["currency"])

		// 令牌统计开关只影响上游分支：授信企业仍返回账期额度而不是 token 自身的 999999
		common.DisplayTokenStatEnabled = true
		defer func() { common.DisplayTokenStatEnabled = false }()
		status, body = creditBillingRequest(t, router, "subscription", "creditownerkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.InDelta(t, 1000/unit, body["hard_limit_usd"], 1e-9)
		assert.EqualValues(t, period.EndAt, body["access_until"])
		status, body = creditBillingRequest(t, router, "usage", "creditownerkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.InDelta(t, 250/unit*100, body["total_usage"], 1e-9)
	})

	t.Run("tokens display type returns raw quota", func(t *testing.T) {
		owner, enterprise := newCreditBillingEnterprise(t, "credit-tokens", model.EnterpriseBillingModeCredit)
		newCreditBillingKey(t, owner, enterprise, "credittokenskey", 0, 0)
		operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
		defer func() { operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD }()

		status, body := creditBillingRequest(t, router, "subscription", "credittokenskey")
		require.Equal(t, http.StatusOK, status, body)
		assert.EqualValues(t, 1000, body["hard_limit_usd"])
		status, body = creditBillingRequest(t, router, "credit", "credittokenskey")
		require.Equal(t, http.StatusOK, status, body)
		assert.EqualValues(t, 1000, body["limit"])
		assert.Equal(t, operation_setting.QuotaDisplayTypeTokens, body["quota_display_type"])
	})

	t.Run("member key is rejected until reassigned as a team key", func(t *testing.T) {
		owner, enterprise := newCreditBillingEnterprise(t, "credit-employee", model.EnterpriseBillingModeCredit)
		member := &model.EnterpriseMember{EnterpriseId: enterprise.Id, Name: "Alice"}
		require.NoError(t, model.CreateEnterpriseMember(member))
		token := newCreditBillingKey(t, owner, enterprise, "creditemployeekey", 0, member.Id)

		for _, path := range []string{"subscription", "usage", "credit"} {
			status, body := creditBillingRequest(t, router, path, "creditemployeekey")
			assert.Equal(t, http.StatusForbidden, status, path)
			assert.Equal(t, "access_denied", creditBillingErrorCode(body), path)
		}

		// 改成团队公共 key（无持有人）后立即放行（归属缓存已失效）
		require.NoError(t, model.AssignEnterpriseToken(enterprise.Id, owner.Id, model.EnterpriseScope{}, token.Id, 0, 0))
		for _, path := range []string{"subscription", "usage", "credit"} {
			status, body := creditBillingRequest(t, router, path, "creditemployeekey")
			assert.Equal(t, http.StatusOK, status, path, body)
		}
	})

	t.Run("prepaid enterprise keeps wallet semantics", func(t *testing.T) {
		owner, enterprise := newCreditBillingEnterprise(t, "prepaid-owner", model.EnterpriseBillingModePrepaid)
		newCreditBillingKey(t, owner, enterprise, "prepaidownerkey", 0, 0)

		status, body := creditBillingRequest(t, router, "subscription", "prepaidownerkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.InDelta(t, (300+50)/unit, body["hard_limit_usd"], 1e-9)
		assert.EqualValues(t, 0, body["access_until"])
		status, body = creditBillingRequest(t, router, "usage", "prepaidownerkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.InDelta(t, 50/unit*100, body["total_usage"], 1e-9)
		status, body = creditBillingRequest(t, router, "credit", "prepaidownerkey")
		assert.Equal(t, http.StatusForbidden, status)
		assert.Equal(t, billingErrorCodeCreditNotEnabled, creditBillingErrorCode(body))
	})

	t.Run("personal user keeps upstream semantics", func(t *testing.T) {
		user := newCreditBillingUser(t, "personal-user", 300, 50)
		newCreditBillingKey(t, user, nil, "personaluserkey", 0, 0)

		status, body := creditBillingRequest(t, router, "subscription", "personaluserkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.InDelta(t, (300+50)/unit, body["hard_limit_usd"], 1e-9)
		status, body = creditBillingRequest(t, router, "usage", "personaluserkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.InDelta(t, 50/unit*100, body["total_usage"], 1e-9)
		status, body = creditBillingRequest(t, router, "credit", "personaluserkey")
		assert.Equal(t, http.StatusForbidden, status)
		assert.Equal(t, billingErrorCodeCreditNotEnabled, creditBillingErrorCode(body))
	})

	t.Run("missing open period reports zero and not found", func(t *testing.T) {
		owner, enterprise := newCreditBillingEnterprise(t, "credit-gap", model.EnterpriseBillingModeCredit)
		newCreditBillingKey(t, owner, enterprise, "creditgapkey", 0, 0)
		require.NoError(t, model.DB.Model(&model.EnterpriseCreditPeriod{}).Where("enterprise_id = ?", enterprise.Id).Update("status", model.EnterpriseCreditPeriodClosing).Error)

		status, body := creditBillingRequest(t, router, "subscription", "creditgapkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.EqualValues(t, 0, body["hard_limit_usd"])
		assert.EqualValues(t, 0, body["access_until"])
		status, body = creditBillingRequest(t, router, "usage", "creditgapkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.EqualValues(t, 0, body["total_usage"])
		status, body = creditBillingRequest(t, router, "credit", "creditgapkey")
		assert.Equal(t, http.StatusNotFound, status)
		assert.Equal(t, billingErrorCodeCreditPeriodNotFound, creditBillingErrorCode(body))
	})

	t.Run("suspended enterprise is rejected", func(t *testing.T) {
		owner, enterprise := newCreditBillingEnterprise(t, "credit-suspended", model.EnterpriseBillingModeCredit)
		newCreditBillingKey(t, owner, enterprise, "creditsuspendedkey", 0, 0)
		require.NoError(t, model.SetEnterpriseStatus(enterprise.Id, model.EnterpriseStatusSuspended))
		model.InvalidateEnterpriseBillingInfo(owner.Id)

		for _, path := range []string{"subscription", "usage", "credit"} {
			status, body := creditBillingRequest(t, router, path, "creditsuspendedkey")
			assert.Equal(t, http.StatusForbidden, status, path)
			assert.Equal(t, "insufficient_user_quota", creditBillingErrorCode(body), path)
		}
	})
}
