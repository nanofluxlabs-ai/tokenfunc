package controller

import (
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"

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
