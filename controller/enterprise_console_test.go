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

func newEnterpriseConsoleRouter() *gin.Engine {
	router := gin.New()
	router.Use(middleware.RequestId(), middleware.AccessTokenAudit())
	api := router.Group("/api")
	api.GET("/enterprise/self", middleware.UserAuth(), GetEnterpriseSelf)
	console := api.Group("/enterprise", middleware.UserAuth(), middleware.EnterpriseAuth())
	console.GET("/teams", ListEnterpriseTeams)
	console.POST("/teams", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleEnterpriseAdmin), CreateEnterpriseTeam)
	console.GET("/members", ListEnterpriseMembers)
	console.POST("/members", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleTeamAdmin), CreateEnterpriseMember)
	console.PUT("/members/:id/role", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleTeamAdmin), SetEnterpriseMemberRole)
	console.GET("/bills", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleEnterpriseAdmin), ListEnterpriseBillsSelf)
	console.GET("/bills/:id/export", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleEnterpriseAdmin), ExportEnterpriseBillSelf)
	console.POST("/tokens", CreateEnterpriseToken)
	return router
}

// 企业侧账单 CSV：未归档的账单从快照 v2 还原财务汇总（多块 CSV，含单价列）；旧快照没有财务块时拒绝导出；别家企业的账单 404
func TestEnterpriseConsoleBillExport(t *testing.T) {
	setupAccessTokenAudit(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}, &model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{}, &model.EnterpriseTokenAssignment{}, &model.EnterpriseBill{}))
	owner := &model.User{Username: "export-owner", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "exp-own"}
	require.NoError(t, model.DB.Create(owner).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: "Export Co"}))
	ent, err := model.GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)

	input := 5.0
	snapshot, err := common.Marshal(map[string]any{
		"snapshot_version": 2, "logs_total_calls": 2, "logs_total_quota": 7000, "detail_total_quota": 7000,
		"by_group_model": []*model.FinanceGroupModelRow{{Group: "default", GroupLabel: "默认", ModelName: "claude-opus", Count: 2, InputTokens: 60, Quota: 7000, AmountUSD: "0.014000", Percentage: 100,
			Ratios: model.FinanceRatios{ModelRatio: &model.FinanceRatioValue{Value: 2.5}, GroupRatio: &model.FinanceRatioValue{Value: 1}}, UnitPrices: model.FinanceUnitPrices{Input: &input}}},
		"by_model": []*model.FinanceGroupModelRow{{ModelName: "claude-opus", Count: 2, InputTokens: 60, Quota: 7000, AmountUSD: "0.014000", Percentage: 100, UnitPrices: model.FinanceUnitPrices{Input: &input}}},
		"by_day":   []*model.FinanceDailyRow{{Day: "2026-03-10", Calls: 2, InputTokens: 60, Quota: 7000, AmountUSD: "0.014000", Percentage: 100}},
	})
	require.NoError(t, err)
	v2 := &model.EnterpriseBill{EnterpriseId: ent.Id, BillNo: "TF-202603-000001", BillType: model.EnterpriseBillTypeCredit, PeriodStart: 1773072000, PeriodEnd: 1773244800, AmountQuota: 7000, Currency: "USD", Status: model.EnterpriseBillUnpaid, IssuedAt: 1773244800, UsageSnapshot: model.JSONValue(snapshot), CreatedAt: 1, UpdatedAt: 1}
	require.NoError(t, model.DB.Create(v2).Error)
	v1 := &model.EnterpriseBill{EnterpriseId: ent.Id, BillNo: "TF-202602-000001", BillType: model.EnterpriseBillTypeCredit, PeriodStart: 1770000000, PeriodEnd: 1770086400, Currency: "USD", Status: model.EnterpriseBillPaid, IssuedAt: 1770086400, UsageSnapshot: model.JSONValue(`{"by_model":[],"detail_total_quota":0}`), CreatedAt: 1, UpdatedAt: 1}
	require.NoError(t, model.DB.Create(v1).Error)
	foreign := &model.EnterpriseBill{EnterpriseId: ent.Id + 100, BillNo: "TF-202603-000002", BillType: model.EnterpriseBillTypeCredit, PeriodStart: 1773072000, PeriodEnd: 1773244800, Currency: "USD", Status: model.EnterpriseBillUnpaid, IssuedAt: 1773244800, UsageSnapshot: model.JSONValue(snapshot), CreatedAt: 1, UpdatedAt: 1}
	require.NoError(t, model.DB.Create(foreign).Error)

	router := newEnterpriseConsoleRouter()
	readToken, _ := createScopedAccessToken(t, owner.Id, 0, "enterprise:read")

	response := accessTokenRequest(router, "GET", "/api/enterprise/bills/"+strconv.FormatInt(v2.Id, 10)+"/export", readToken, "", "")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Contains(t, response.Header().Get("Content-Type"), "text/csv")
	assert.Contains(t, response.Header().Get("Content-Disposition"), "TF-202603-000001_2026-03-10_2026-03-11.csv")
	body := response.Body.String()
	assert.True(t, strings.HasPrefix(body, "\uFEFF"), "CSV 带 BOM")
	assert.Contains(t, body, "# 企业: Export Co")
	assert.Contains(t, body, "汇总(按令牌分组-模型)")
	assert.Contains(t, body, "汇总(按模型)")
	assert.Contains(t, body, "汇总(按天)")
	assert.Contains(t, body, "默认,claude-opus,2,60,0,0,0,0,5.0000,-,-,-,-,0.014000,100.00,2.5,1")
	assert.Contains(t, body, "2026-03-10,2,60,0,0,0,0.014000,100.00")
	assert.NotContains(t, body, "调用明细", "未归档账单的导出不含逐条明细")

	response = accessTokenRequest(router, "GET", "/api/enterprise/bills/"+strconv.FormatInt(v1.Id, 10)+"/export", readToken, "", "")
	require.Equal(t, http.StatusOK, response.Code)
	assert.Contains(t, response.Body.String(), `"success":false`)
	assert.Contains(t, response.Body.String(), "usage breakdown snapshot")

	assert.Equal(t, http.StatusNotFound, accessTokenRequest(router, "GET", "/api/enterprise/bills/"+strconv.FormatInt(foreign.Id, 10)+"/export", readToken, "", "").Code)
}

// 企业控制台通过访问令牌（PAT）自动化访问：必须带 enterprise:* 作用域，且令牌所属用户必须是企业主账号或已绑定登录的成员
func TestEnterpriseConsoleAccessTokenScopes(t *testing.T) {
	admin, _ := setupAccessTokenAudit(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}, &model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{}, &model.EnterpriseTokenAssignment{}))
	owner := &model.User{Username: "ent-owner", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "ent-owner"}
	require.NoError(t, model.DB.Create(owner).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: "Owner Co"}))

	router := newEnterpriseConsoleRouter()
	readToken, _ := createScopedAccessToken(t, owner.Id, 0, "enterprise:read")
	writeToken, _ := createScopedAccessToken(t, owner.Id, 0, "enterprise:write")
	profileToken, _ := createScopedAccessToken(t, owner.Id, 0, "profile:read")
	nonOwnerToken, _ := createScopedAccessToken(t, admin.Id, 0, "enterprise:read", "enterprise:write")

	for _, test := range []struct {
		name, method, path, token string
		status                    int
	}{
		{"read scope lists teams", "GET", "/api/enterprise/teams", readToken, http.StatusOK},
		{"read scope cannot create", "POST", "/api/enterprise/teams", readToken, http.StatusForbidden},
		{"write scope creates", "POST", "/api/enterprise/teams", writeToken, http.StatusOK},
		{"unrelated scope is rejected", "GET", "/api/enterprise/teams", profileToken, http.StatusForbidden},
		{"non-enterprise user is rejected even with scope", "GET", "/api/enterprise/teams", nonOwnerToken, http.StatusForbidden},
		{"self returns null for non-enterprise user", "GET", "/api/enterprise/self", nonOwnerToken, http.StatusOK},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := accessTokenRequest(router, test.method, test.path, test.token, "", `{"name":"R&D","sort":0}`)
			assert.Equal(t, test.status, response.Code, response.Body.String())
		})
	}
	var count int64
	require.NoError(t, model.DB.Model(&model.EnterpriseTeam{}).Where("is_default = ?", false).Count(&count).Error)
	assert.Equal(t, int64(1), count, "only the write-scoped request may create a team")
}

// 成员角色的范围：团队管理员只看本团队、不能建团队、不能看账单、不能授予高于自己的角色；企业管理员看全企业
func TestEnterpriseConsoleMemberRoles(t *testing.T) {
	setupAccessTokenAudit(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}, &model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{}, &model.EnterpriseTokenAssignment{}, &model.EnterpriseBill{}))
	owner := &model.User{Username: "role-owner", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "role-own"}
	require.NoError(t, model.DB.Create(owner).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: "Role Co"}))
	ent, err := model.GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	rd := &model.EnterpriseTeam{EnterpriseId: ent.Id, Name: "Research"}
	require.NoError(t, model.CreateEnterpriseTeam(rd))
	qa := &model.EnterpriseTeam{EnterpriseId: ent.Id, Name: "QA"}
	require.NoError(t, model.CreateEnterpriseTeam(qa))
	lead := &model.EnterpriseMember{EnterpriseId: ent.Id, TeamId: rd.Id, Name: "Lead"}
	require.NoError(t, model.CreateEnterpriseMember(lead))
	require.NoError(t, model.CreateEnterpriseMember(&model.EnterpriseMember{EnterpriseId: ent.Id, TeamId: qa.Id, Name: "Tester"}))
	leadUser := &model.User{Username: "role-lead", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "role-ld"}
	require.NoError(t, model.DB.Create(leadUser).Error)
	require.NoError(t, model.BindEnterpriseMemberLogin(ent.Id, lead.Id, leadUser, model.EnterpriseMemberRoleTeamAdmin))

	router := newEnterpriseConsoleRouter()
	leadToken, _ := createScopedAccessToken(t, leadUser.Id, 0, "enterprise:read", "enterprise:write")

	response := accessTokenRequest(router, "GET", "/api/enterprise/self", leadToken, "", "")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), `"role":"team_admin"`)
	assert.Contains(t, response.Body.String(), `"is_owner":false`)

	response = accessTokenRequest(router, "GET", "/api/enterprise/teams", leadToken, "", "")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), `"name":"Research"`)
	assert.NotContains(t, response.Body.String(), `"name":"QA"`)
	response = accessTokenRequest(router, "GET", "/api/enterprise/members", leadToken, "", "")
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), `"name":"Lead"`)
	assert.NotContains(t, response.Body.String(), `"name":"Tester"`)

	assert.Equal(t, http.StatusForbidden, accessTokenRequest(router, "POST", "/api/enterprise/teams", leadToken, "", `{"name":"Ops"}`).Code, "team admins cannot create teams")
	assert.Equal(t, http.StatusForbidden, accessTokenRequest(router, "GET", "/api/enterprise/bills", leadToken, "", "").Code, "team admins cannot see bills")
	// 建成员：不传团队落本团队；指定别的团队按不存在处理
	response = accessTokenRequest(router, "POST", "/api/enterprise/members", leadToken, "", `{"name":"NewDev"}`)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Equal(t, http.StatusNotFound, accessTokenRequest(router, "POST", "/api/enterprise/members", leadToken, "", `{"name":"Intruder","team_id":`+itoa(qa.Id)+`}`).Code)
	// key 落本团队
	response = accessTokenRequest(router, "POST", "/api/enterprise/tokens", leadToken, "", `{"name":"lead-key","unlimited_quota":true}`)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var keyCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseTokenAssignment{}).Where("team_id = ?", rd.Id).Count(&keyCount).Error)
	assert.Equal(t, int64(1), keyCount)
	// 团队管理员不能把人提成企业管理员
	assert.Equal(t, http.StatusForbidden, accessTokenRequest(router, "PUT", "/api/enterprise/members/"+itoa(lead.Id)+"/role", leadToken, "", `{"role":"enterprise_admin"}`).Code)
}

func itoa(value int) string {
	return strconv.Itoa(value)
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
	team := &model.EnterpriseTeam{EnterpriseId: enterprise.Id, Name: "R&D"}
	require.NoError(t, model.CreateEnterpriseTeam(team))
	alice := &model.EnterpriseMember{EnterpriseId: enterprise.Id, TeamId: team.Id, Name: "Alice", EmployeeNo: "R001"}
	require.NoError(t, model.CreateEnterpriseMember(alice))
	// 成员 key 只允许 gpt-4o；团队公共 key（无持有人）不限模型
	aliceKey := &model.Token{UserId: owner.Id, Key: "meemployeekey", Name: "Alice-Codex", Status: common.TokenStatusEnabled, ExpiredTime: -1, RemainQuota: 6200, UsedQuota: 300, ModelLimitsEnabled: true, ModelLimits: "gpt-4o"}
	require.NoError(t, model.CreateEnterpriseToken(enterprise.Id, model.EnterpriseScope{}, aliceKey, team.Id, alice.Id))
	teamKey := newCreditBillingKey(t, owner, enterprise, "meteamkey", team.Id, 0)
	// 主账号在上游 /keys 页自建的 key：没有归属行
	ownerKey := &model.Token{UserId: owner.Id, Key: "meownerkey", Name: "meownerkey", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, model.DB.Create(ownerKey).Error)
	period, err := model.GetOpenCreditPeriod(enterprise.Id)
	require.NoError(t, err)
	now := common.GetTimestamp()
	for _, event := range []model.EnterpriseUsageEvent{
		{UserId: owner.Id, TokenId: aliceKey.Id, ModelName: "gpt-4o", Quota: 120, PromptTokens: 10, CreatedAt: now, CreditPeriodId: period.Id},
		{UserId: owner.Id, TokenId: aliceKey.Id, ModelName: "gpt-4o", Quota: 80, PromptTokens: 10, CreatedAt: now, CreditPeriodId: period.Id},
		{UserId: owner.Id, TokenId: aliceKey.Id, ModelName: "gpt-4o-mini", Quota: 5, PromptTokens: 1, CreatedAt: now, CreditPeriodId: period.Id},
		{UserId: owner.Id, TokenId: teamKey.Id, ModelName: "gpt-4o", Quota: 999, PromptTokens: 1, CreatedAt: now, CreditPeriodId: period.Id},
	} {
		require.NoError(t, model.RecordEnterpriseUsage(event))
	}

	t.Run("member key sees its team, holder, key quota and usage", func(t *testing.T) {
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

	t.Run("team key without a holder is allowed with a null member", func(t *testing.T) {
		status, body := me("meteamkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.Nil(t, body["member"])
		assert.Equal(t, map[string]any{"name": "R&D", "budget_state": nil}, body["team"])
		assert.Equal(t, []any{"gpt-4o", "gpt-4o-mini"}, body["models"])
		usage, _ := body["usage"].(map[string]any)
		assert.Equal(t, map[string]any{"quota": float64(999), "requests": float64(1)}, usage["today"])
	})

	t.Run("archived team is rejected even if the key was re-enabled", func(t *testing.T) {
		archived := &model.EnterpriseTeam{EnterpriseId: enterprise.Id, Name: "Legacy"}
		require.NoError(t, model.CreateEnterpriseTeam(archived))
		legacyKey := newCreditBillingKey(t, owner, enterprise, "melegacykey", archived.Id, 0)
		require.NoError(t, model.ArchiveEnterpriseTeam(enterprise.Id, archived.Id))
		// 归档会停用 key（TokenAuth 直接拒绝）；手工重新启用后仍由本接口按团队状态拦截
		require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", legacyKey.Id).Update("status", common.TokenStatusEnabled).Error)
		status, body := me("melegacykey")
		assert.Equal(t, http.StatusForbidden, status, body)
		assert.Equal(t, "access_denied", creditBillingErrorCode(body))
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
