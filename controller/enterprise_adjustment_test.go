package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 人工调账只支持 PostgreSQL（企业模块二开约定），测试跑在真实 PG 上，未配置 DSN 时跳过
func setupEnterpriseAdjustmentPostgres(t *testing.T) {
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
		&model.User{}, &model.UserSession{}, &model.AuthFlow{}, &model.TwoFA{}, &model.PasskeyCredential{}, &model.Log{}, &model.AuditLog{}, &model.Option{},
		&model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{}, &model.EnterpriseTokenAssignment{},
		&model.EnterpriseCreditPeriod{}, &model.EnterpriseCreditNotifyRecord{}, &model.EnterpriseLedgerEntry{}, &model.EnterpriseBill{},
	}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousRedis, previousSecret := common.RedisEnabled, common.SessionSecret
	// 审计日志与会话校验会走用户缓存，测试进程没有 Redis 连接
	common.RedisEnabled = false
	common.SessionSecret = "enterprise-adjustment-test-secret"
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	model.InitColumnNames()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.RedisEnabled, common.SessionSecret = previousRedis, previousSecret
		model.InitColumnNames()
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
}

// newEnterpriseAdjustmentRouter 与 router/enterprise-router.go 同形；登录态由 identity 注入（UserAuth 写入的同一组键）
func newEnterpriseAdjustmentRouter(operator *model.User, identity service.AuthIdentity) *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	asOperator := func(c *gin.Context) {
		c.Set("id", operator.Id)
		c.Set("role", operator.Role)
		c.Set("username", operator.Username)
		c.Set("session_id", identity.SessionID)
		c.Set("auth_version", identity.UserAuthVersion)
		c.Set("session_version", identity.SessionVersion)
		c.Set(common.RequestIdKey, "enterprise-adjustment-test")
		c.Next()
	}
	engine.POST("/api/admin/enterprise/enterprises/:id/adjustments", asOperator, AdminCreateEnterpriseAdjustment)
	engine.PUT("/api/admin/enterprise/enterprises/:id/credit", asOperator, AdminConfigureEnterpriseCredit)
	engine.DELETE("/api/admin/enterprise/enterprises/:id/credit", asOperator, AdminSwitchEnterprisePrepaid)
	engine.GET("/api/admin/enterprise/group-options", asOperator, AdminListEnterpriseGroupOptions)
	engine.POST("/api/admin/enterprise/enterprises", asOperator, AdminCreateEnterprise)
	engine.GET("/api/admin/enterprise/enterprises/:id", asOperator, AdminGetEnterprise)
	engine.PUT("/api/admin/enterprise/enterprises/:id", asOperator, AdminUpdateEnterprise)
	return engine
}

func enterpriseAdjustmentRequest(router http.Handler, enterpriseId int, proof string, body string) *httptest.ResponseRecorder {
	return enterpriseAdminRequest(router, http.MethodPost, fmt.Sprintf("/api/admin/enterprise/enterprises/%d/adjustments", enterpriseId), proof, body)
}

func enterpriseAdminRequest(router http.Handler, method string, path string, proof string, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if proof != "" {
		request.Header.Set("X-Security-Proof", proof)
	}
	request.RemoteAddr = "192.0.2.8:4567"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

// enterpriseAdjustProof 为 root 操作员签发一张密码方式、绑定到「企业主 user_id + enterprise_adjust」的二次验证凭证
func enterpriseAdjustProof(t *testing.T, identity service.AuthIdentity, ownerId int, action string) string {
	t.Helper()
	return issueSecurityEnrollmentProof(t, identity, service.VerificationOperation{
		Scope: service.VerificationScopeAdminUserManage, Context: []byte(fmt.Sprintf(`{"user_id":%d,"action":%q}`, ownerId, action)),
	}, service.VerificationMethodPassword)
}

// 参数校验在二次验证之前；没有 / 不匹配的凭证不动任何余额；凭证正确时钱包与账单各调一次并留审计
func TestAdminCreateEnterpriseAdjustment(t *testing.T) {
	setupEnterpriseAdjustmentPostgres(t)
	operator := &model.User{Username: "adjust-root", Password: "root-operator-hash", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "adjust-root"}
	require.NoError(t, model.DB.Create(operator).Error)
	// 直接落一条登录会话构造 step-up 身份（同 createAccessTokenTestSession），不经过登录流程的缓存与计数
	identity, _ := createAccessTokenTestSession(t, operator.Id, "enterprise-adjustment-session")
	router := newEnterpriseAdjustmentRouter(operator, identity)

	owner := &model.User{Username: "adjust-owner", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", Quota: 5 * int(common.QuotaPerUnit), AuthVersion: 1, AffCode: "adjust-own"}
	require.NoError(t, model.DB.Create(owner).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: "Adjust Co"}, ""))
	enterprise, err := model.GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)

	otherOwner := &model.User{Username: "adjust-other", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "adjust-oth"}
	require.NoError(t, model.DB.Create(otherOwner).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(otherOwner.Id, &model.Enterprise{Name: "Other Co"}, ""))
	other, err := model.GetEnterpriseByUserId(otherOwner.Id)
	require.NoError(t, err)
	// 企业计费信息按 user_id 做进程内缓存，用例结束必须清掉，否则后续 sqlite 用例里同 id 的用户会命中这里的企业态
	for _, userId := range []int{operator.Id, owner.Id, otherOwner.Id} {
		model.InvalidateEnterpriseBillingInfo(userId)
		t.Cleanup(func() { model.InvalidateEnterpriseBillingInfo(userId) })
	}
	now := common.GetTimestamp()
	foreignBill := &model.EnterpriseBill{EnterpriseId: other.Id, BillNo: "TF-OTHER-000001", BillType: model.EnterpriseBillTypeCredit, PeriodStart: now - 86400, PeriodEnd: now, AmountUSD: decimal.NewFromInt(10), TotalUSD: decimal.NewFromInt(10), Currency: "USD", Status: model.EnterpriseBillUnpaid, IssuedAt: now, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, model.DB.Create(foreignBill).Error)
	ownBill := &model.EnterpriseBill{EnterpriseId: enterprise.Id, BillNo: "TF-OWN-000001", BillType: model.EnterpriseBillTypeCredit, PeriodStart: now - 86400, PeriodEnd: now, AmountUSD: decimal.NewFromInt(10), TotalUSD: decimal.NewFromInt(10), PaidUSD: decimal.NewFromInt(4), Currency: "USD", Status: model.EnterpriseBillPartiallyPaid, IssuedAt: now, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, model.DB.Create(ownBill).Error)

	ledgerCount := func() int64 {
		var count int64
		require.NoError(t, model.DB.Model(&model.EnterpriseLedgerEntry{}).Where("enterprise_id = ?", enterprise.Id).Count(&count).Error)
		return count
	}
	ownerQuota := func() int {
		quota, err := model.GetUserQuota(owner.Id, true)
		require.NoError(t, err)
		return quota
	}

	t.Run("validation runs before verification", func(t *testing.T) {
		for name, body := range map[string]string{
			"short remark":  `{"kind":"wallet","amount_usd":-1,"remark":"abc"}`,
			"zero amount":   `{"kind":"wallet","amount_usd":0,"remark":"zero amount"}`,
			"unknown kind":  `{"kind":"credit","amount_usd":1,"remark":"unknown kind"}`,
			"bill id empty": `{"kind":"bill","amount_usd":1,"remark":"missing bill id"}`,
			"too large":     `{"kind":"wallet","amount_usd":2000000000,"remark":"too large amount"}`,
		} {
			response := enterpriseAdjustmentRequest(router, enterprise.Id, "", body)
			assert.Equal(t, http.StatusOK, response.Code, name)
			assert.Contains(t, response.Body.String(), `"success":false`, name)
			assert.NotContains(t, response.Body.String(), "SECURITY_PROOF", name+": validation must answer before asking for a proof")
		}
		assert.Equal(t, int64(0), ledgerCount())
	})

	t.Run("missing or mismatched proof does not touch the balance", func(t *testing.T) {
		body := `{"kind":"wallet","amount_usd":-2,"remark":"duplicate charge refund"}`
		response := enterpriseAdjustmentRequest(router, enterprise.Id, "", body)
		assert.Equal(t, http.StatusForbidden, response.Code)
		assert.Contains(t, response.Body.String(), "SECURITY_PROOF_REQUIRED")
		// 同一作用域、不同动作（手工充值）的凭证不能复用到调账
		response = enterpriseAdjustmentRequest(router, enterprise.Id, enterpriseAdjustProof(t, identity, owner.Id, "topup"), body)
		assert.Equal(t, http.StatusForbidden, response.Code)
		assert.Contains(t, response.Body.String(), "SECURITY_PROOF_CONTEXT_MISMATCH")
		// 绑定到别的企业主的凭证也不能用
		response = enterpriseAdjustmentRequest(router, enterprise.Id, enterpriseAdjustProof(t, identity, otherOwner.Id, "enterprise_adjust"), body)
		assert.Equal(t, http.StatusForbidden, response.Code)
		assert.Contains(t, response.Body.String(), "SECURITY_PROOF_CONTEXT_MISMATCH")
		assert.Equal(t, 5*int(common.QuotaPerUnit), ownerQuota())
		assert.Equal(t, int64(0), ledgerCount())
	})

	t.Run("wallet adjustment with proof", func(t *testing.T) {
		response := enterpriseAdjustmentRequest(router, enterprise.Id, enterpriseAdjustProof(t, identity, owner.Id, "enterprise_adjust"), `{"kind":"wallet","amount_usd":-2,"remark":"duplicate charge refund"}`)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		assert.Contains(t, response.Body.String(), `"success":true`)
		assert.Contains(t, response.Body.String(), `"ref_type":"wallet"`)
		assert.Equal(t, 3*int(common.QuotaPerUnit), ownerQuota())
		assert.Equal(t, int64(1), ledgerCount())
		var audit model.AuditLog
		require.NoError(t, model.LOG_DB.Where("action = ?", "enterprise.adjustment.wallet").First(&audit).Error)
		assert.Equal(t, fmt.Sprintf("Adjusted balance of enterprise %d by -2 USD: duplicate charge refund", enterprise.Id), audit.Content)
		method, _ := common.Marshal(audit.Other.Op.Params["verification_method"])
		assert.JSONEq(t, `"password"`, string(method))
		// 凭证一次性：重放同一张被拒绝
		response = enterpriseAdjustmentRequest(router, enterprise.Id, "", `{"kind":"wallet","amount_usd":-100,"remark":"exceeds the balance"}`)
		assert.Equal(t, http.StatusForbidden, response.Code)
		response = enterpriseAdjustmentRequest(router, enterprise.Id, enterpriseAdjustProof(t, identity, owner.Id, "enterprise_adjust"), `{"kind":"wallet","amount_usd":-100,"remark":"exceeds the balance"}`)
		assert.Equal(t, http.StatusOK, response.Code)
		assert.Contains(t, response.Body.String(), model.ErrEnterpriseAdjustmentExceedsBalance.Error())
		assert.Equal(t, 3*int(common.QuotaPerUnit), ownerQuota())
		assert.Equal(t, int64(1), ledgerCount())
	})

	t.Run("bill of another enterprise is not found", func(t *testing.T) {
		response := enterpriseAdjustmentRequest(router, enterprise.Id, "", fmt.Sprintf(`{"kind":"bill","bill_id":%d,"amount_usd":-1,"remark":"cross enterprise"}`, foreignBill.Id))
		assert.Equal(t, http.StatusNotFound, response.Code)
		response = enterpriseAdjustmentRequest(router, enterprise.Id+100, "", `{"kind":"wallet","amount_usd":-1,"remark":"missing enterprise"}`)
		assert.Equal(t, http.StatusNotFound, response.Code)
	})

	t.Run("bill adjustment with proof", func(t *testing.T) {
		body := fmt.Sprintf(`{"kind":"bill","bill_id":%d,"amount_usd":-6,"remark":"September double billing"}`, ownBill.Id)
		response := enterpriseAdjustmentRequest(router, enterprise.Id, "", body)
		assert.Equal(t, http.StatusForbidden, response.Code)
		response = enterpriseAdjustmentRequest(router, enterprise.Id, enterpriseAdjustProof(t, identity, owner.Id, "enterprise_adjust"), body)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		assert.Contains(t, response.Body.String(), `"status":"paid"`)
		assert.Contains(t, response.Body.String(), `"ref_type":"bill"`)
		stored, err := model.GetEnterpriseBill(ownBill.Id)
		require.NoError(t, err)
		assert.True(t, stored.TotalUSD.Equal(decimal.NewFromInt(4)), stored.TotalUSD.String())
		assert.True(t, stored.AdjustmentUSD.Equal(decimal.NewFromInt(-6)), stored.AdjustmentUSD.String())
		assert.Equal(t, model.EnterpriseBillPaid, stored.Status)
		assert.Equal(t, 3*int(common.QuotaPerUnit), ownerQuota(), "bill adjustments never touch the wallet")
		assert.Equal(t, int64(2), ledgerCount())
		var audit model.AuditLog
		require.NoError(t, model.LOG_DB.Where("action = ?", "enterprise.adjustment.bill").First(&audit).Error)
		assert.Equal(t, fmt.Sprintf("Adjusted bill TF-OWN-000001 of enterprise %d by -6 USD: September double billing", enterprise.Id), audit.Content)
	})
}

// 开通 / 修改授信与切回预付都要求「企业主 user_id + enterprise_credit」的二次验证；无凭证或动作不符时计费模式不变
func TestAdminEnterpriseCreditRequiresProof(t *testing.T) {
	setupEnterpriseAdjustmentPostgres(t)
	operator := &model.User{Username: "credit-root", Password: "root-operator-hash", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "credit-root"}
	require.NoError(t, model.DB.Create(operator).Error)
	identity, _ := createAccessTokenTestSession(t, operator.Id, "enterprise-credit-session")
	router := newEnterpriseAdjustmentRouter(operator, identity)

	owner := &model.User{Username: "credit-owner", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "credit-own"}
	require.NoError(t, model.DB.Create(owner).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: "Credit Proof Co"}, ""))
	enterprise, err := model.GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	for _, userId := range []int{operator.Id, owner.Id} {
		model.InvalidateEnterpriseBillingInfo(userId)
		t.Cleanup(func() { model.InvalidateEnterpriseBillingInfo(userId) })
	}
	creditPath := fmt.Sprintf("/api/admin/enterprise/enterprises/%d/credit", enterprise.Id)
	billingMode := func() string {
		stored, err := model.GetEnterpriseById(enterprise.Id)
		require.NoError(t, err)
		return stored.BillingMode
	}
	configureBody := `{"cycle_type":"natural_month","limit_usd":100}`

	response := enterpriseAdminRequest(router, http.MethodPut, creditPath, "", configureBody)
	assert.Equal(t, http.StatusForbidden, response.Code)
	assert.Contains(t, response.Body.String(), "SECURITY_PROOF_REQUIRED")
	response = enterpriseAdminRequest(router, http.MethodPut, creditPath, enterpriseAdjustProof(t, identity, owner.Id, "enterprise_adjust"), configureBody)
	assert.Equal(t, http.StatusForbidden, response.Code)
	assert.Contains(t, response.Body.String(), "SECURITY_PROOF_CONTEXT_MISMATCH")
	assert.Equal(t, model.EnterpriseBillingModePrepaid, billingMode())

	response = enterpriseAdminRequest(router, http.MethodPut, creditPath, enterpriseAdjustProof(t, identity, owner.Id, "enterprise_credit"), configureBody)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), `"success":true`)
	assert.Equal(t, model.EnterpriseBillingModeCredit, billingMode())
	var audit model.AuditLog
	require.NoError(t, model.LOG_DB.Where("action = ?", "enterprise.credit.configure").First(&audit).Error)
	method, _ := common.Marshal(audit.Other.Op.Params["verification_method"])
	assert.JSONEq(t, `"password"`, string(method))

	response = enterpriseAdminRequest(router, http.MethodDelete, creditPath, "", "")
	assert.Equal(t, http.StatusForbidden, response.Code)
	assert.Contains(t, response.Body.String(), "SECURITY_PROOF_REQUIRED")
	assert.Equal(t, model.EnterpriseBillingModeCredit, billingMode())
	response = enterpriseAdminRequest(router, http.MethodDelete, creditPath, enterpriseAdjustProof(t, identity, owner.Id, "enterprise_credit"), "")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), `"success":true`)
	assert.Equal(t, model.EnterpriseBillingModePrepaid, billingMode())

	response = enterpriseAdminRequest(router, http.MethodDelete, fmt.Sprintf("/api/admin/enterprise/enterprises/%d/credit", enterprise.Id+100), "", "")
	assert.Equal(t, http.StatusNotFound, response.Code)
}

// 企业主账号分组：可选项来自分组倍率；新建 / 修改时非法分组被拒且不落任何写入；改分组让主账号登录态失效并留审计
func TestAdminEnterpriseOwnerGroup(t *testing.T) {
	setupEnterpriseAdjustmentPostgres(t)
	previousGroupRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"vip":0.8,"default":1}`))
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousGroupRatios)) })
	operator := &model.User{Username: "group-root", Password: "root-operator-hash", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "group-root"}
	require.NoError(t, model.DB.Create(operator).Error)
	identity, _ := createAccessTokenTestSession(t, operator.Id, "enterprise-group-session")
	router := newEnterpriseAdjustmentRouter(operator, identity)

	response := enterpriseAdminRequest(router, http.MethodGet, "/api/admin/enterprise/group-options", "", "")
	require.Equal(t, http.StatusOK, response.Code)
	assert.JSONEq(t, `{"success":true,"message":"","data":[{"group":"default","ratio":1},{"group":"vip","ratio":0.8}]}`, response.Body.String())

	createBody := func(group string, email string) string {
		return fmt.Sprintf(`{"mode":"new_user","username":"group-owner","password":"password123","email":%q,"group":%q,"enterprise":{"name":"Group Co"}}`, email, group)
	}
	for name, body := range map[string]string{
		"unknown group": createBody("missing", "owner@group.co"),
		"invalid email": createBody("vip", "not-an-email"),
		"missing email": createBody("vip", ""),
	} {
		response = enterpriseAdminRequest(router, http.MethodPost, "/api/admin/enterprise/enterprises", "", body)
		assert.Contains(t, response.Body.String(), `"success":false`, name)
	}
	assert.Contains(t, enterpriseAdminRequest(router, http.MethodPost, "/api/admin/enterprise/enterprises", "", createBody("missing", "owner@group.co")).Body.String(), `"message":"invalid group"`)
	assert.Contains(t, enterpriseAdminRequest(router, http.MethodPost, "/api/admin/enterprise/enterprises", "", createBody("vip", "  ")).Body.String(), `"message":"Login email is required"`)
	var userCount int64
	require.NoError(t, model.DB.Model(&model.User{}).Where("username = ?", "group-owner").Count(&userCount).Error)
	assert.Equal(t, int64(0), userCount)

	response = enterpriseAdminRequest(router, http.MethodPost, "/api/admin/enterprise/enterprises", "", createBody("vip", "Owner@Group.co"))
	require.Contains(t, response.Body.String(), `"success":true`, response.Body.String())
	assert.Contains(t, response.Body.String(), `"owner_group":"vip"`, "创建结果与详情同形，带实际分组")
	var owner model.User
	require.NoError(t, model.DB.Where("username = ?", "group-owner").First(&owner).Error)
	assert.Equal(t, "vip", owner.Group)
	assert.Equal(t, "owner@group.co", owner.Email)
	enterprise, err := model.GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	t.Cleanup(func() { model.InvalidateEnterpriseBillingInfo(owner.Id) })
	_, _ = createAccessTokenTestSession(t, owner.Id, "enterprise-group-owner-session")
	enterprisePath := fmt.Sprintf("/api/admin/enterprise/enterprises/%d", enterprise.Id)

	// 非法分组在资料写入之前拒绝：企业名不变
	response = enterpriseAdminRequest(router, http.MethodPut, enterprisePath, "", `{"name":"Renamed Co","group":"missing"}`)
	assert.Contains(t, response.Body.String(), `"message":"invalid group"`)
	stored, err := model.GetEnterpriseById(enterprise.Id)
	require.NoError(t, err)
	assert.Equal(t, "Group Co", stored.Name)

	response = enterpriseAdminRequest(router, http.MethodPut, enterprisePath, "", `{"name":"Renamed Co","group":"default"}`)
	require.Contains(t, response.Body.String(), `"success":true`, response.Body.String())
	var updated model.User
	require.NoError(t, model.DB.First(&updated, owner.Id).Error)
	assert.Equal(t, "default", updated.Group)
	assert.Equal(t, owner.AuthVersion+1, updated.AuthVersion)
	var session model.UserSession
	require.NoError(t, model.DB.Where("sid = ?", "enterprise-group-owner-session").First(&session).Error)
	assert.NotEqual(t, model.UserSessionStatusActive, session.Status)
	var audit model.AuditLog
	require.NoError(t, model.LOG_DB.Where("action = ?", "enterprise.update").First(&audit).Error)
	groupChange, _ := common.Marshal(map[string]any{"from": audit.Other.Op.Params["group_from"], "to": audit.Other.Op.Params["group_to"]})
	assert.JSONEq(t, `{"from":"vip","to":"default"}`, string(groupChange))

	response = enterpriseAdminRequest(router, http.MethodGet, enterprisePath, "", "")
	assert.Contains(t, response.Body.String(), `"owner_group":"default"`)
	assert.Contains(t, response.Body.String(), `"name":"Renamed Co"`)
}
