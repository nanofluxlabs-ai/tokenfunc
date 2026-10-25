package controller

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
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
	console.GET("/overview", GetEnterpriseOverview)
	console.GET("/teams", ListEnterpriseTeams)
	console.POST("/teams", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleEnterpriseAdmin), CreateEnterpriseTeam)
	console.GET("/members", ListEnterpriseMembers)
	console.POST("/members", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleTeamAdmin), CreateEnterpriseMember)
	console.PUT("/members/:id/role", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleTeamAdmin), SetEnterpriseMemberRole)
	console.GET("/bills", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleEnterpriseAdmin), ListEnterpriseBillsSelf)
	console.GET("/bills/:id/export", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleEnterpriseAdmin), ExportEnterpriseBillSelf)
	console.GET("/tokens", ListEnterpriseTokens)
	console.GET("/tokens/options", GetEnterpriseTokenOptions)
	console.POST("/tokens", CreateEnterpriseToken)
	console.PUT("/tokens/:id", UpdateEnterpriseToken)
	console.PUT("/tokens/:id/status", UpdateEnterpriseTokenStatus)
	console.DELETE("/tokens/:id", DeleteEnterpriseToken)
	console.POST("/tokens/:id/key", GetEnterpriseTokenKey)
	console.POST("/tokens/batch-status", BatchUpdateEnterpriseTokenStatus)
	console.POST("/tokens/batch-delete", BatchDeleteEnterpriseTokens)
	console.PUT("/tokens/:id/quota-policy", SetEnterpriseTokenQuotaPolicy)
	console.POST("/tokens/batch-quota-policy", BatchSetEnterpriseTokenQuotaPolicy)
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
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}, &model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{}, &model.EnterpriseTokenAssignment{}, &model.EnterpriseUsageDaily{}))
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
	// 建 key 时 GetUserGroup 用到带引号的 group 列名，单跑本用例时也要初始化
	model.InitColumnNames()
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}, &model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{}, &model.EnterpriseTokenAssignment{}, &model.EnterpriseUsageDaily{}, &model.EnterpriseBill{}))
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

// 企业概览：key 四态按余额 / 到期时间派生、待办计数（逾期账单、超预算团队、耗尽与即将过期 key）、近 30 天补零、
// 授信预警命中；团队管理员只拿到本团队的统计且没有账单 / 账期字段
func TestEnterpriseConsoleOverview(t *testing.T) {
	setupAccessTokenAudit(t)
	model.InitColumnNames()
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}, &model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{}, &model.EnterpriseTokenAssignment{},
		&model.EnterpriseUsageDaily{}, &model.EnterpriseBill{}, &model.EnterpriseCreditPeriod{}, &model.EnterpriseTeamBudgetNotify{}, &model.EnterpriseTokenQuotaPolicy{}))
	owner := &model.User{Username: "ov-owner", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "ov-own"}
	require.NoError(t, model.DB.Create(owner).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: "Overview Co"}))
	ent, err := model.GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	// 研发团队预算 $0.002（1000 quota），本月已用 1500 → 超预算；QA 团队无预算
	rd := &model.EnterpriseTeam{EnterpriseId: ent.Id, Name: "Research", MonthlyBudgetQuota: 1000, BudgetAlertPercent: 80, BudgetEnforce: true}
	require.NoError(t, model.CreateEnterpriseTeam(rd))
	qa := &model.EnterpriseTeam{EnterpriseId: ent.Id, Name: "QA"}
	require.NoError(t, model.CreateEnterpriseTeam(qa))
	lead := &model.EnterpriseMember{EnterpriseId: ent.Id, TeamId: rd.Id, Name: "Lead"}
	require.NoError(t, model.CreateEnterpriseMember(lead))
	require.NoError(t, model.CreateEnterpriseMember(&model.EnterpriseMember{EnterpriseId: ent.Id, TeamId: qa.Id, Name: "Tester"}))
	leadUser := &model.User{Username: "ov-lead", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "ov-ld"}
	require.NoError(t, model.DB.Create(leadUser).Error)
	require.NoError(t, model.BindEnterpriseMemberLogin(ent.Id, lead.Id, leadUser, model.EnterpriseMemberRoleTeamAdmin))

	now := common.GetTimestamp()
	newKey := func(name string, teamId int, token model.Token) {
		token.UserId, token.Name, token.Key = owner.Id, name, name
		if token.Status == 0 {
			token.Status = common.TokenStatusEnabled
		}
		if token.ExpiredTime == 0 {
			token.ExpiredTime = -1
		}
		require.NoError(t, model.CreateEnterpriseToken(ent.Id, model.EnterpriseScope{}, &token, teamId, 0))
	}
	newKey("rd-active", rd.Id, model.Token{UnlimitedQuota: true})
	newKey("rd-exhausted-flag", rd.Id, model.Token{Status: common.TokenStatusExhausted})
	newKey("rd-exhausted-derived", rd.Id, model.Token{RemainQuota: 0})
	newKey("rd-expiring", rd.Id, model.Token{UnlimitedQuota: true, ExpiredTime: now + 3600})
	newKey("qa-expired-derived", qa.Id, model.Token{UnlimitedQuota: true, ExpiredTime: now - 60})
	newKey("qa-disabled", qa.Id, model.Token{UnlimitedQuota: true, Status: common.TokenStatusDisabled})

	today, monthStart := model.CurrentEnterpriseUsageDays()
	require.NoError(t, model.DB.Create(&model.EnterpriseUsageDaily{Day: monthStart, EnterpriseId: ent.Id, TokenId: 1, ModelName: "gpt-4o", TeamId: rd.Id, RequestCount: 3, Quota: 1500, UpdatedAt: 1}).Error)
	require.NoError(t, model.DB.Create(&model.EnterpriseUsageDaily{Day: today, EnterpriseId: ent.Id, TokenId: 2, ModelName: "gpt-4o", TeamId: qa.Id, RequestCount: 1, Quota: 200, UpdatedAt: 1}).Error)
	// 两张未结清账单：一张已逾期、一张未到期
	require.NoError(t, model.DB.Create(&model.EnterpriseBill{BillNo: "B-overdue", EnterpriseId: ent.Id, BillType: model.EnterpriseBillTypeCredit, Status: model.EnterpriseBillUnpaid, IssuedAt: now - 86400*20, DueAt: now - 86400, CreatedAt: now, UpdatedAt: now}).Error)
	require.NoError(t, model.DB.Create(&model.EnterpriseBill{BillNo: "B-due", EnterpriseId: ent.Id, BillType: model.EnterpriseBillTypeCredit, Status: model.EnterpriseBillPartiallyPaid, IssuedAt: now, DueAt: now + 86400*10, CreatedAt: now, UpdatedAt: now}).Error)
	// 授信：当前账期已用 90%，阈值 80% → 预警命中
	require.NoError(t, model.DB.Model(&model.Enterprise{}).Where("id = ?", ent.Id).Updates(map[string]any{"billing_mode": model.EnterpriseBillingModeCredit, "credit_alert_percent": 80}).Error)
	require.NoError(t, model.DB.Create(&model.EnterpriseCreditPeriod{EnterpriseId: ent.Id, PeriodNo: 1, StartAt: now - 86400, EndAt: now + 86400, LimitQuota: 10000, UsedQuota: 9000, Status: model.EnterpriseCreditPeriodOpen, CreatedAt: now, UpdatedAt: now}).Error)

	router := newEnterpriseConsoleRouter()
	ownerToken, _ := createScopedAccessToken(t, owner.Id, 0, "enterprise:read")
	leadToken, _ := createScopedAccessToken(t, leadUser.Id, 0, "enterprise:read")
	overview := func(token string) map[string]any {
		response := accessTokenRequest(router, "GET", "/api/enterprise/overview", token, "", "")
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var parsed struct {
			Success bool           `json:"success"`
			Data    map[string]any `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &parsed), response.Body.String())
		require.True(t, parsed.Success, response.Body.String())
		return parsed.Data
	}
	section := func(data map[string]any, key string) map[string]any {
		value, _ := data[key].(map[string]any)
		require.NotNil(t, value, key)
		return value
	}

	// 企业主：全企业统计 + 财务待办
	data := overview(ownerToken)
	keys := section(data, "keys")
	assert.Equal(t, float64(6), keys["total"])
	assert.Equal(t, float64(2), keys["active"])
	assert.Equal(t, float64(1), keys["disabled"])
	assert.Equal(t, float64(2), keys["exhausted"], "status=4 plus remain_quota<=0")
	assert.Equal(t, float64(1), keys["expired"], "derived from expired_time")
	assert.Equal(t, float64(1), keys["expiring_7d"])
	org := section(data, "org")
	assert.Equal(t, float64(3), org["teams"], "Default + Research + QA")
	assert.Equal(t, float64(2), org["members"])
	assert.Equal(t, float64(1), org["login_members"])
	month := section(data, "month")
	assert.Equal(t, float64(1700), month["quota"])
	assert.Equal(t, float64(0), month["prev_quota"])
	daily, _ := data["daily"].([]any)
	require.Len(t, daily, 30, "30 days with zero fill")
	last := daily[29].(map[string]any)
	assert.Equal(t, today, last["day"])
	assert.Equal(t, float64(200), last["quota"])
	todos := section(data, "todos")
	assert.Equal(t, float64(2), todos["unpaid_bills"])
	assert.Equal(t, float64(1), todos["overdue_bills"])
	assert.Equal(t, float64(2), todos["exhausted_keys"])
	assert.Equal(t, float64(1), todos["expiring_keys"])
	assert.Equal(t, true, todos["credit_alert_hit"])
	exceeded, _ := todos["team_budget_exceeded"].([]any)
	require.Len(t, exceeded, 1)
	assert.Equal(t, "Research", exceeded[0].(map[string]any)["team_name"])
	assert.Equal(t, true, exceeded[0].(map[string]any)["budget_enforce"])
	assert.Empty(t, todos["team_budget_warn"])
	assert.Equal(t, float64(9000), section(data, "open_period")["used_quota"])
	assert.Nil(t, data["scope"])
	assert.Nil(t, data["team_budget"])

	// 团队管理员：只看研发团队，没有账单 / 账期 / 预警
	data = overview(leadToken)
	scope := section(data, "scope")
	assert.Equal(t, float64(rd.Id), scope["team_id"])
	assert.Equal(t, "Research", scope["team_name"])
	keys = section(data, "keys")
	assert.Equal(t, float64(4), keys["total"])
	assert.Equal(t, float64(2), keys["exhausted"])
	assert.Equal(t, float64(0), keys["expired"])
	org = section(data, "org")
	assert.Equal(t, float64(1), org["teams"])
	assert.Equal(t, float64(1), org["members"])
	assert.Equal(t, float64(1500), section(data, "month")["quota"])
	assert.Equal(t, float64(1500), section(data, "team_budget")["month_quota"])
	assert.Equal(t, "exceeded", section(data, "team_budget")["budget_state"])
	todos = section(data, "todos")
	assert.Equal(t, float64(0), todos["unpaid_bills"])
	assert.Equal(t, float64(0), todos["overdue_bills"])
	assert.Equal(t, false, todos["credit_alert_hit"])
	assert.Nil(t, data["open_period"])
	assert.Equal(t, float64(0), data["balance_quota"])
}

// 企业密钥页：访问限制校验、编辑含归属、启停校验、删除清归属、批量范围、成员取明文、本月消耗回填、key 上限按企业覆盖
func TestEnterpriseConsoleTokenManagement(t *testing.T) {
	setupAccessTokenAudit(t)
	// GetUserGroup / 列表 SELECT 用到带引号的 group / key 列名
	model.InitColumnNames()
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}, &model.Ability{}, &model.Enterprise{}, &model.EnterpriseTeam{}, &model.EnterpriseMember{}, &model.EnterpriseTokenAssignment{}, &model.EnterpriseTokenQuotaPolicy{}, &model.EnterpriseUsageDaily{}))
	require.NoError(t, model.DB.Create(&model.Ability{Group: "default", Model: "gpt-4o", ChannelId: 1, Enabled: true}).Error)
	owner := &model.User{Username: "key-owner", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "key-own"}
	require.NoError(t, model.DB.Create(owner).Error)
	require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: "Key Co"}))
	ent, err := model.GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	rd := &model.EnterpriseTeam{EnterpriseId: ent.Id, Name: "Research"}
	require.NoError(t, model.CreateEnterpriseTeam(rd))
	qa := &model.EnterpriseTeam{EnterpriseId: ent.Id, Name: "QA"}
	require.NoError(t, model.CreateEnterpriseTeam(qa))
	alice := &model.EnterpriseMember{EnterpriseId: ent.Id, TeamId: rd.Id, Name: "Alice"}
	require.NoError(t, model.CreateEnterpriseMember(alice))
	tester := &model.EnterpriseMember{EnterpriseId: ent.Id, TeamId: qa.Id, Name: "Tester"}
	require.NoError(t, model.CreateEnterpriseMember(tester))
	leadUser := &model.User{Username: "key-lead", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "key-ld"}
	require.NoError(t, model.DB.Create(leadUser).Error)
	require.NoError(t, model.BindEnterpriseMemberLogin(ent.Id, alice.Id, leadUser, model.EnterpriseMemberRoleTeamAdmin))

	router := newEnterpriseConsoleRouter()
	ownerToken, _ := createScopedAccessToken(t, owner.Id, 0, "enterprise:read", "enterprise:write")
	leadToken, _ := createScopedAccessToken(t, leadUser.Id, 0, "enterprise:read", "enterprise:write")
	call := func(method, path, token, body string) (int, map[string]any) {
		response := accessTokenRequest(router, method, path, token, "", body)
		var parsed map[string]any
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &parsed), response.Body.String())
		return response.Code, parsed
	}
	dataOf := func(parsed map[string]any) map[string]any {
		data, _ := parsed["data"].(map[string]any)
		return data
	}

	// 选项：主账号分组、分组模型、上限
	code, body := call("GET", "/api/enterprise/tokens/options", ownerToken, "")
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, "default", dataOf(body)["owner_group"])
	assert.Contains(t, dataOf(body)["models_by_group"].(map[string]any)[""], "gpt-4o")

	// 校验：非法 CIDR、越权分组、模型不在分组、持有人不属团队
	for _, test := range []struct{ name, body string }{
		{"invalid cidr", `{"name":"k","unlimited_quota":true,"allow_ips":"10.0.0.0/99"}`},
		{"group not selectable", `{"name":"k","unlimited_quota":true,"group":"ghost-group"}`},
		{"model not in group", `{"name":"k","unlimited_quota":true,"model_limits":["claude-9"]}`},
		{"holder not in team", `{"name":"k","unlimited_quota":true,"team_id":` + itoa(rd.Id) + `,"member_id":` + itoa(tester.Id) + `}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			code, body := call("POST", "/api/enterprise/tokens", ownerToken, test.body)
			assert.Equal(t, http.StatusOK, code)
			assert.Equal(t, false, body["success"], body["message"])
		})
	}

	// 创建：带模型白名单、CIDR、分组，归属研发团队 Alice
	code, body = call("POST", "/api/enterprise/tokens", ownerToken, `{"name":"alice-key","unlimited_quota":true,"team_id":`+itoa(rd.Id)+`,"member_id":`+itoa(alice.Id)+`,"group":"default","model_limits":["gpt-4o","gpt-4o"],"allow_ips":"10.0.0.0/8\n 192.168.1.1 \n"}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, body["success"], body["message"])
	keyId := int(dataOf(body)["id"].(float64))
	created, err := model.GetTokenById(keyId)
	require.NoError(t, err)
	assert.True(t, created.ModelLimitsEnabled)
	assert.Equal(t, "gpt-4o", created.ModelLimits)
	assert.Equal(t, "10.0.0.0/8\n192.168.1.1", *created.AllowIps)
	assert.Equal(t, "default", created.Group)

	// 本月消耗回填
	require.NoError(t, model.DB.Create(&model.EnterpriseUsageDaily{Day: model.EnterpriseMonthStartDay(time.Now()), EnterpriseId: ent.Id, TokenId: keyId, ModelName: "gpt-4o", TeamId: rd.Id, MemberId: alice.Id, RequestCount: 2, Quota: 1500, UpdatedAt: 1}).Error)
	code, body = call("GET", "/api/enterprise/tokens?member_id="+itoa(alice.Id), ownerToken, "")
	require.Equal(t, http.StatusOK, code)
	items := dataOf(body)["items"].([]any)
	require.Len(t, items, 1)
	row := items[0].(map[string]any)
	assert.Equal(t, float64(1500), row["month_quota"])
	assert.Equal(t, "Research", row["team_name"])
	assert.Equal(t, "gpt-4o", row["model_limits"])
	assert.Equal(t, "", row["reset_period"], "no periodic quota yet")

	// 周期限额：团队管理员给本团队的 key 设每日 $1 → 立刻 remain_quota = $1、不限关闭，列表透出策略；
	// 自定义周期越界拒绝；混入范围外 id 整批 404；never 删策略但保留当前额度
	code, body = call("PUT", "/api/enterprise/tokens/"+itoa(keyId)+"/quota-policy", leadToken, `{"reset_period":"daily","period_quota":500000}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, body["success"], body["message"])
	withPolicy, err := model.GetTokenById(keyId)
	require.NoError(t, err)
	assert.Equal(t, 500000, withPolicy.RemainQuota)
	assert.False(t, withPolicy.UnlimitedQuota)
	code, body = call("GET", "/api/enterprise/tokens?member_id="+itoa(alice.Id), ownerToken, "")
	require.Equal(t, http.StatusOK, code)
	row = dataOf(body)["items"].([]any)[0].(map[string]any)
	assert.Equal(t, "daily", row["reset_period"])
	assert.Equal(t, float64(500000), row["period_quota"])
	assert.Greater(t, row["next_reset_at"].(float64), float64(time.Now().Unix()))
	code, body = call("PUT", "/api/enterprise/tokens/"+itoa(keyId)+"/quota-policy", ownerToken, `{"reset_period":"custom","custom_seconds":60,"period_quota":1}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, false, body["success"], "custom period below one hour is rejected")
	code, body = call("POST", "/api/enterprise/tokens", ownerToken, `{"name":"qa-weekly","unlimited_quota":true,"team_id":`+itoa(qa.Id)+`,"quota_policy":{"reset_period":"weekly","period_quota":250000}}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, body["success"], body["message"])
	weeklyId := int(dataOf(body)["id"].(float64))
	weekly, err := model.GetTokenById(weeklyId)
	require.NoError(t, err)
	assert.Equal(t, 250000, weekly.RemainQuota, "a key created with a policy starts at the period quota")
	code, _ = call("POST", "/api/enterprise/tokens/batch-quota-policy", leadToken, `{"token_ids":[`+itoa(keyId)+`,`+itoa(weeklyId)+`],"reset_period":"monthly","period_quota":1000}`)
	assert.Equal(t, http.StatusNotFound, code, "a QA key is outside the Research lead's scope")
	code, body = call("POST", "/api/enterprise/tokens/batch-quota-policy", ownerToken, `{"token_ids":[`+itoa(keyId)+`,`+itoa(weeklyId)+`],"reset_period":"never"}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, body["success"], body["message"])
	var policyCount int64
	require.NoError(t, model.DB.Model(&model.EnterpriseTokenQuotaPolicy{}).Count(&policyCount).Error)
	assert.Zero(t, policyCount)
	weekly, err = model.GetTokenById(weeklyId)
	require.NoError(t, err)
	assert.Equal(t, 250000, weekly.RemainQuota, "never keeps the quota as a fixed quota")
	code, body = call("POST", "/api/enterprise/tokens/batch-delete", ownerToken, `{"ids":[`+itoa(weeklyId)+`]}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, body["success"], body["message"])

	// 编辑：改名 + 挪到 QA 团队公共 key + 固定额度 0（之后不能启用）
	code, body = call("PUT", "/api/enterprise/tokens/"+itoa(keyId), ownerToken, `{"name":"qa-key","unlimited_quota":false,"remain_quota":0,"team_id":`+itoa(qa.Id)+`}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, body["success"], body["message"])
	assignment, err := model.GetEnterpriseTokenAssignment(keyId)
	require.NoError(t, err)
	assert.Equal(t, qa.Id, assignment.TeamId)
	assert.Equal(t, 0, assignment.MemberId)
	updated, err := model.GetTokenById(keyId)
	require.NoError(t, err)
	assert.Equal(t, "qa-key", updated.Name)
	assert.False(t, updated.ModelLimitsEnabled, "model limits cleared when omitted")

	// 启停：停用成功；耗尽的 key 不能启用；团队管理员看不到别的团队的 key
	code, body = call("PUT", "/api/enterprise/tokens/"+itoa(keyId)+"/status", ownerToken, `{"status":2}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, true, body["success"], body["message"])
	code, body = call("PUT", "/api/enterprise/tokens/"+itoa(keyId)+"/status", ownerToken, `{"status":1}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, false, body["success"], "exhausted key cannot be enabled")
	code, _ = call("PUT", "/api/enterprise/tokens/"+itoa(keyId)+"/status", leadToken, `{"status":2}`)
	assert.Equal(t, http.StatusNotFound, code)
	code, _ = call("POST", "/api/enterprise/tokens/"+itoa(keyId)+"/key", leadToken, "")
	assert.Equal(t, http.StatusNotFound, code)

	// 团队管理员在本团队发 key 并取明文；批量操作混入范围外 id 整批 404
	code, body = call("POST", "/api/enterprise/tokens", leadToken, `{"name":"lead-key","unlimited_quota":true,"member_id":`+itoa(alice.Id)+`}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, body["success"], body["message"])
	leadKeyId := int(dataOf(body)["id"].(float64))
	code, body = call("POST", "/api/enterprise/tokens/"+itoa(leadKeyId)+"/key", leadToken, "")
	require.Equal(t, http.StatusOK, code)
	assert.NotEmpty(t, dataOf(body)["key"])
	code, _ = call("POST", "/api/enterprise/tokens/batch-status", leadToken, `{"ids":[`+itoa(leadKeyId)+`,`+itoa(keyId)+`],"status":2}`)
	assert.Equal(t, http.StatusNotFound, code)
	code, body = call("POST", "/api/enterprise/tokens/batch-status", ownerToken, `{"ids":[`+itoa(leadKeyId)+`,`+itoa(keyId)+`],"status":1}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, float64(1), dataOf(body)["updated"], "exhausted key is skipped")
	assert.Len(t, dataOf(body)["skipped"], 1)

	// 删除：清归属；批量删除
	code, body = call("DELETE", "/api/enterprise/tokens/"+itoa(keyId), ownerToken, "")
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, true, body["success"], body["message"])
	assignment, err = model.GetEnterpriseTokenAssignment(keyId)
	require.NoError(t, err)
	assert.Nil(t, assignment)
	_, err = model.GetTokenById(keyId)
	assert.Error(t, err, "token is soft-deleted")
	code, body = call("POST", "/api/enterprise/tokens/batch-delete", ownerToken, `{"ids":[`+itoa(leadKeyId)+`]}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, float64(1), dataOf(body)["deleted"])

	// key 上限：企业上限 1 时（站点上限更大则以站点为准），把站点上限压到 1 验证拦截
	previous := operation_setting.GetTokenSetting().MaxUserTokens
	operation_setting.GetTokenSetting().MaxUserTokens = 1
	t.Cleanup(func() { operation_setting.GetTokenSetting().MaxUserTokens = previous })
	code, body = call("POST", "/api/enterprise/tokens", ownerToken, `{"name":"one","unlimited_quota":true}`)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, body["success"], body["message"])
	code, body = call("POST", "/api/enterprise/tokens", ownerToken, `{"name":"two","unlimited_quota":true}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, false, body["success"], "site limit reached")
	require.NoError(t, model.DB.Model(&model.Enterprise{}).Where("id = ?", ent.Id).Update("max_tokens", 5).Error)
	refreshed, err := model.GetEnterpriseById(ent.Id)
	require.NoError(t, err)
	require.Equal(t, 5, refreshed.MaxTokens)
	code, body = call("POST", "/api/enterprise/tokens", ownerToken, `{"name":"two","unlimited_quota":true}`)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, true, body["success"], "enterprise limit overrides site limit")
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
		assert.Equal(t, map[string]any{"name": "R&D", "budget_state": model.TeamBudgetStateNone}, body["team"])
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

	t.Run("team budget state and key quota policy are reported", func(t *testing.T) {
		// 先登记清理再改状态，失败时也不污染后面的子用例
		t.Cleanup(func() {
			require.NoError(t, model.DB.Model(team).Update("monthly_budget_quota", 0).Error)
			model.InvalidateTeamMonthUsage(team.Id)
			require.NoError(t, model.SetTokenQuotaPolicies(enterprise.Id, owner.Id, model.EnterpriseScope{}, []int{aliceKey.Id}, model.TokenQuotaPolicyInput{ResetPeriod: model.TokenQuotaResetNever}))
		})
		require.NoError(t, model.DB.Model(team).Updates(map[string]any{"monthly_budget_quota": 2000, "budget_alert_percent": 50}).Error)
		model.InvalidateTeamMonthUsage(team.Id)
		require.NoError(t, model.SetTokenQuotaPolicies(enterprise.Id, owner.Id, model.EnterpriseScope{}, []int{aliceKey.Id}, model.TokenQuotaPolicyInput{ResetPeriod: model.TokenQuotaResetDaily, PeriodQuota: 5000}))
		status, body := me("meemployeekey")
		require.Equal(t, http.StatusOK, status, body)
		// 团队本月 1204（成员 key 205 + 团队 key 999）已过 2000 × 50% 的告警线
		assert.Equal(t, map[string]any{"name": "R&D", "budget_state": model.TeamBudgetStateWarn}, body["team"])
		key, _ := body["key"].(map[string]any)
		policy, _ := key["quota_policy"].(map[string]any)
		assert.Equal(t, model.TokenQuotaResetDaily, policy["reset_period"])
		assert.EqualValues(t, 5000, policy["period_quota"])
		assert.Greater(t, policy["next_reset_at"], float64(0))
		assert.EqualValues(t, 5000, key["remain_quota"], "写入策略即施行周期额度")
	})

	t.Run("team key without a holder is allowed with a null member", func(t *testing.T) {
		status, body := me("meteamkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.Nil(t, body["member"])
		assert.Equal(t, map[string]any{"name": "R&D", "budget_state": model.TeamBudgetStateNone}, body["team"])
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
