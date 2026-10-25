package controller

import (
	"net/http"
	"strconv"
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
	console.POST("/tokens", CreateEnterpriseToken)
	return router
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
