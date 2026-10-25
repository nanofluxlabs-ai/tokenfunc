package controller

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 企业控制台通过访问令牌（PAT）自动化访问：必须带 enterprise:* 作用域，且令牌所属用户必须是企业主账号
func TestEnterpriseConsoleAccessTokenScopes(t *testing.T) {
	admin, _ := setupAccessTokenAudit(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Enterprise{}, &model.EnterpriseDepartment{}))
	owner := &model.User{Username: "ent-owner", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "ent-owner"}
	require.NoError(t, model.DB.Create(owner).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: "Owner Co"}))

	router := gin.New()
	router.Use(middleware.RequestId(), middleware.AccessTokenAudit())
	api := router.Group("/api")
	api.GET("/enterprise/self", middleware.UserAuth(), GetEnterpriseSelf)
	console := api.Group("/enterprise", middleware.UserAuth(), middleware.EnterpriseOwnerAuth())
	console.GET("/departments", ListEnterpriseDepartments)
	console.POST("/departments", CreateEnterpriseDepartment)

	readToken, _ := createScopedAccessToken(t, owner.Id, 0, "enterprise:read")
	writeToken, _ := createScopedAccessToken(t, owner.Id, 0, "enterprise:write")
	profileToken, _ := createScopedAccessToken(t, owner.Id, 0, "profile:read")
	nonOwnerToken, _ := createScopedAccessToken(t, admin.Id, 0, "enterprise:read", "enterprise:write")

	for _, test := range []struct {
		name, method, path, token string
		status                    int
	}{
		{"read scope lists departments", "GET", "/api/enterprise/departments", readToken, http.StatusOK},
		{"read scope cannot create", "POST", "/api/enterprise/departments", readToken, http.StatusForbidden},
		{"write scope creates", "POST", "/api/enterprise/departments", writeToken, http.StatusOK},
		{"unrelated scope is rejected", "GET", "/api/enterprise/departments", profileToken, http.StatusForbidden},
		{"non-enterprise user is rejected even with scope", "GET", "/api/enterprise/departments", nonOwnerToken, http.StatusForbidden},
		{"self returns null for non-enterprise user", "GET", "/api/enterprise/self", nonOwnerToken, http.StatusOK},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := accessTokenRequest(router, test.method, test.path, test.token, "", `{"name":"R&D","parent_id":0,"sort":0}`)
			assert.Equal(t, test.status, response.Code, response.Body.String())
		})
	}
	var count int64
	require.NoError(t, model.DB.Model(&model.EnterpriseDepartment{}).Count(&count).Error)
	assert.Equal(t, int64(1), count, "only the write-scoped request may create a department")
}

// 企业主账号（预付 / 授信）在线充值入口一律 403，普通用户放行；升级为企业后负缓存立即失效
func TestRejectEnterpriseOwnerBlocksOnlineTopUp(t *testing.T) {
	setupCreditBillingPostgres(t)
	router := gin.New()
	router.POST("/api/user/pay", func(c *gin.Context) {
		userId, _ := strconv.Atoi(c.GetHeader("X-Test-User"))
		c.Set("id", userId)
	}, middleware.RejectEnterpriseOwner(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
	pay := func(userId int) (int, map[string]any) {
		request := httptest.NewRequest(http.MethodPost, "/api/user/pay", strings.NewReader(`{"amount":10}`))
		request.Header.Set("X-Test-User", strconv.Itoa(userId))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		body := map[string]any{}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body), response.Body.String())
		return response.Code, body
	}

	personal := newCreditBillingUser(t, "topup-personal", 100, 0)
	status, body := pay(personal.Id)
	assert.Equal(t, http.StatusOK, status, body)

	for _, mode := range []string{model.EnterpriseBillingModePrepaid, model.EnterpriseBillingModeCredit} {
		owner, _ := newCreditBillingEnterprise(t, "topup-"+mode, mode)
		status, body = pay(owner.Id)
		assert.Equal(t, http.StatusForbidden, status, mode)
		assert.Equal(t, false, body["success"], mode)
		assert.Equal(t, middleware.EnterpriseOnlineTopUpRejectedMessage, body["message"], mode)
	}

	// 先以普通用户身份命中一次负缓存，升级后不等 TTL 过期即被拦截
	upgraded := newCreditBillingUser(t, "topup-upgraded", 100, 0)
	status, _ = pay(upgraded.Id)
	require.Equal(t, http.StatusOK, status)
	require.NoError(t, model.UpgradeUserToEnterprise(upgraded.Id, &model.Enterprise{Name: "Upgraded Co"}))
	status, _ = pay(upgraded.Id)
	assert.Equal(t, http.StatusForbidden, status)
}

// 员工凭自己的 API key 自查：只返回 key 级归属 / 额度 / 用量，不含企业余额与授信额度
func TestEnterpriseEmployeeMe(t *testing.T) {
	setupCreditBillingPostgres(t)
	require.NoError(t, model.DB.Create(&[]model.Ability{
		{Group: "default", Model: "gpt-4o", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "gpt-4o-mini", ChannelId: 1, Enabled: true},
	}).Error)
	// 可用模型口径与 /v1/models 一致：未配置计费的模型不出现，这里给两个模型配倍率
	previousRatios := ratio_setting.ModelRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"gpt-4o":1,"gpt-4o-mini":1}`))
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(previousRatios)) })
	router := gin.New()
	router.GET("/v1/enterprise/employee/me", middleware.TokenAuth(), GetEnterpriseEmployeeMe)
	me := func(key string) (int, map[string]any) {
		request := httptest.NewRequest(http.MethodGet, "/v1/enterprise/employee/me", nil)
		request.Header.Set("Authorization", "Bearer sk-"+key)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		body := map[string]any{}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body), response.Body.String())
		return response.Code, body
	}

	owner, enterprise := newCreditBillingEnterprise(t, "me-owner", model.EnterpriseBillingModeCredit)
	department := &model.EnterpriseDepartment{EnterpriseId: enterprise.Id, Name: "R&D"}
	require.NoError(t, model.CreateEnterpriseDepartment(department))
	alice := &model.EnterpriseEmployee{EnterpriseId: enterprise.Id, DepartmentId: department.Id, Name: "Alice", EmployeeNo: "R001"}
	require.NoError(t, model.CreateEnterpriseEmployee(alice))
	project := &model.EnterpriseProject{EnterpriseId: enterprise.Id, Name: "Bot"}
	require.NoError(t, model.CreateEnterpriseProject(project))
	// 员工 key 只允许 gpt-4o；项目公共 key 不限模型
	aliceKey := &model.Token{UserId: owner.Id, Key: "meemployeekey", Name: "Alice-Codex", Status: common.TokenStatusEnabled, ExpiredTime: -1, RemainQuota: 6200, UsedQuota: 300, ModelLimitsEnabled: true, ModelLimits: "gpt-4o"}
	require.NoError(t, model.CreateEnterpriseToken(enterprise.Id, aliceKey, alice.Id, 0))
	projectKey := newCreditBillingKey(t, owner, enterprise, "meprojectkey", 0, project.Id)
	newCreditBillingKey(t, owner, enterprise, "meownerkey", 0, 0)
	period, err := model.GetOpenCreditPeriod(enterprise.Id)
	require.NoError(t, err)
	now := common.GetTimestamp()
	for _, event := range []model.EnterpriseUsageEvent{
		{UserId: owner.Id, TokenId: aliceKey.Id, ModelName: "gpt-4o", Quota: 120, PromptTokens: 10, CreatedAt: now, CreditPeriodId: period.Id},
		{UserId: owner.Id, TokenId: aliceKey.Id, ModelName: "gpt-4o", Quota: 80, PromptTokens: 10, CreatedAt: now, CreditPeriodId: period.Id},
		{UserId: owner.Id, TokenId: aliceKey.Id, ModelName: "gpt-4o-mini", Quota: 5, PromptTokens: 1, CreatedAt: now, CreditPeriodId: period.Id},
		{UserId: owner.Id, TokenId: projectKey.Id, ModelName: "gpt-4o", Quota: 999, PromptTokens: 1, CreatedAt: now, CreditPeriodId: period.Id},
	} {
		require.NoError(t, model.RecordEnterpriseUsage(event))
	}

	t.Run("employee key sees its team, holder, key quota and usage", func(t *testing.T) {
		status, body := me("meemployeekey")
		require.Equal(t, http.StatusOK, status, body)
		assert.Equal(t, "enterprise_employee", body["object"])
		assert.Equal(t, map[string]any{"name": "me-owner Co", "billing_mode": model.EnterpriseBillingModeCredit}, body["enterprise"])
		assert.Equal(t, map[string]any{"name": "R&D", "budget_state": nil}, body["team"])
		assert.Equal(t, map[string]any{"name": "Alice", "employee_no": "R001"}, body["member"])
		key, _ := body["key"].(map[string]any)
		assert.Equal(t, "Alice-Codex", key["name"])
		assert.Equal(t, false, key["unlimited_quota"])
		assert.EqualValues(t, 6200, key["remain_quota"])
		assert.EqualValues(t, 300, key["used_quota"])
		assert.EqualValues(t, -1, key["expired_time"])
		assert.Nil(t, key["quota_policy"])
		usage, _ := body["usage"].(map[string]any)
		assert.Equal(t, map[string]any{"quota": float64(205), "requests": float64(3)}, usage["today"])
		assert.Equal(t, map[string]any{"quota": float64(205), "requests": float64(3)}, usage["month"])
		assert.Equal(t, []any{
			map[string]any{"model": "gpt-4o", "quota": float64(200), "requests": float64(2)},
			map[string]any{"model": "gpt-4o-mini", "quota": float64(5), "requests": float64(1)},
		}, body["top_models"])
		assert.Equal(t, []any{"gpt-4o"}, body["models"], "model_limits restricts the visible models")
		for _, field := range []string{"balance", "limit_quota", "available_quota", "quota"} {
			assert.NotContains(t, body, field)
		}
	})

	t.Run("project key without a holder is allowed with a null member", func(t *testing.T) {
		status, body := me("meprojectkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.Nil(t, body["member"])
		assert.Equal(t, map[string]any{"name": "", "budget_state": nil}, body["team"])
		assert.Equal(t, []any{"gpt-4o", "gpt-4o-mini"}, body["models"])
		usage, _ := body["usage"].(map[string]any)
		assert.Equal(t, map[string]any{"quota": float64(999), "requests": float64(1)}, usage["today"])
	})

	t.Run("unassigned owner key and personal key are rejected", func(t *testing.T) {
		status, body := me("meownerkey")
		assert.Equal(t, http.StatusForbidden, status)
		assert.Equal(t, "access_denied", creditBillingErrorCode(body))

		personal := newCreditBillingUser(t, "me-personal", 100, 0)
		newCreditBillingKey(t, personal, nil, "mepersonalkey", 0, 0)
		status, body = me("mepersonalkey")
		assert.Equal(t, http.StatusForbidden, status)
		assert.Equal(t, "access_denied", creditBillingErrorCode(body))
	})

	t.Run("suspended enterprise is rejected", func(t *testing.T) {
		require.NoError(t, model.SetEnterpriseStatus(enterprise.Id, model.EnterpriseStatusSuspended))
		model.InvalidateEnterpriseBillingInfo(owner.Id)
		status, body := me("meemployeekey")
		assert.Equal(t, http.StatusForbidden, status)
		assert.Equal(t, "insufficient_user_quota", creditBillingErrorCode(body))
	})
}
