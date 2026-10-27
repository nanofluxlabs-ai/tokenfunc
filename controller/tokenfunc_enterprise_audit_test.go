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

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 企业审计视角：主账号 / 企业管理员看到本企业成员在控制台的操作（含新补的成员新增、查看完整 key），
// 不含别家企业、平台管理员对本企业的操作、成员的个人安全事件；外部视角置空请求方法与路由（访问令牌记录除外）
func TestEnterpriseAuditScopeAndRedaction(t *testing.T) {
	setupEnterpriseAdjustmentPostgres(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}))
	t.Cleanup(func() { require.NoError(t, model.DB.Migrator().DropTable(&model.Token{})) })

	newUser := func(name string, role int) *model.User {
		user := &model.User{Username: name, Password: "placeholder", Role: role, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: name}
		require.NoError(t, model.DB.Create(user).Error)
		return user
	}
	newEnterprise := func(owner *model.User) *model.Enterprise {
		require.NoError(t, model.UpgradeUserToEnterprise(owner.Id, &model.Enterprise{Name: owner.Username + " Co"}, ""))
		enterprise, err := model.GetEnterpriseByUserId(owner.Id)
		require.NoError(t, err)
		return enterprise
	}
	bindMember := func(enterprise *model.Enterprise, user *model.User, role string) {
		member := &model.EnterpriseMember{EnterpriseId: enterprise.Id, Name: user.Username, Status: model.EnterpriseMemberStatusActive}
		require.NoError(t, model.CreateEnterpriseMember(member))
		require.NoError(t, model.BindEnterpriseMemberLogin(enterprise.Id, member.Id, user, role))
	}
	ownerA, ownerB := newUser("audit-owner-a", common.RoleCommonUser), newUser("audit-owner-b", common.RoleCommonUser)
	developer, entAdmin := newUser("audit-dev", common.RoleCommonUser), newUser("audit-ent-admin", common.RoleCommonUser)
	platformAdmin := newUser("audit-platform", common.RoleAdminUser)
	entA, entB := newEnterprise(ownerA), newEnterprise(ownerB)
	bindMember(entA, developer, model.EnterpriseMemberRoleDeveloper)
	bindMember(entA, entAdmin, model.EnterpriseMemberRoleEnterpriseAdmin)
	plainKey := strings.Repeat("k", 48)
	token := &model.Token{UserId: ownerA.Id, Name: "audit-key", Key: plainKey, Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, model.CreateEnterpriseToken(entA.Id, model.EnterpriseScope{}, token, 0, 0))

	withEnterprise := func(enterpriseId int) model.AuditOther {
		return model.AuditOther{Op: &model.AuditOperation{Action: "enterprise.team.create", Params: model.AuditFields{"enterprise_id": enterpriseId}}}
	}
	model.RecordAuditLog(nil, model.AuditLog{UserId: ownerB.Id, ActorRole: common.RoleCommonUser, Category: model.AuditCategorySecurity, Action: "enterprise.team.create", Route: "/api/enterprise/teams", Other: withEnterprise(entB.Id)})
	model.RecordAuditLog(nil, model.AuditLog{UserId: platformAdmin.Id, ActorRole: common.RoleAdminUser, Category: model.AuditCategoryOperation, Action: "enterprise.status", Route: "/api/admin/enterprise/enterprises/:id/status", Method: "PUT", Other: withEnterprise(entA.Id)})
	model.RecordAuditLog(nil, model.AuditLog{UserId: developer.Id, ActorRole: common.RoleCommonUser, Category: model.AuditCategorySecurity, Action: "passkey.register", Route: "/api/user/passkey", Method: "POST"})
	model.RecordAuditLog(nil, model.AuditLog{UserId: developer.Id, ActorRole: common.RoleCommonUser, Category: model.AuditCategoryAccessToken, Action: "access_token.use", Route: "/api/log/self", Method: "GET"})

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	asUser := func(c *gin.Context) {
		id, _ := strconv.Atoi(c.GetHeader("X-Test-User"))
		user, err := model.GetUserById(id, false)
		require.NoError(t, err)
		c.Set("id", user.Id)
		c.Set("role", user.Role)
		c.Set("username", user.Username)
		c.Next()
	}
	api := engine.Group("/api", asUser)
	api.GET("/audit", GetAuditLogs)
	api.GET("/audit/self", GetAuditLogs)
	console := api.Group("/enterprise", middleware.EnterpriseAuth())
	console.GET("/audit", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleEnterpriseAdmin), GetAuditLogs)
	console.POST("/members", middleware.RequireEnterpriseRole(model.EnterpriseMemberRoleTeamAdmin), CreateEnterpriseMember)
	console.POST("/tokens/:id/key", GetEnterpriseTokenKey)
	request := func(user *model.User, method string, path string, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User", strconv.Itoa(user.Id))
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		return rec
	}
	items := func(rec *httptest.ResponseRecorder) []map[string]any {
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		payload := map[string]any{}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &payload))
		require.Equal(t, true, payload["success"], payload["message"])
		result := make([]map[string]any, 0)
		for _, item := range payload["data"].(map[string]any)["items"].([]any) {
			result = append(result, item.(map[string]any))
		}
		return result
	}

	created := request(ownerA, http.MethodPost, "/api/enterprise/members", `{"name":"Carol"}`)
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())
	reveal := request(ownerA, http.MethodPost, "/api/enterprise/tokens/"+strconv.Itoa(token.Id)+"/key", "")
	require.Equal(t, http.StatusOK, reveal.Code, reveal.Body.String())

	actions := make([]string, 0)
	for _, entry := range items(request(entAdmin, http.MethodGet, "/api/enterprise/audit?p=1&page_size=20", "")) {
		actions = append(actions, entry["action"].(string))
		assert.Equal(t, "", entry["route"], "企业视角不展示路由")
		assert.Equal(t, "", entry["method"])
		other, _ := entry["other"].(map[string]any)
		assert.NotContains(t, other, "admin_info")
		encoded, err := common.Marshal(entry)
		require.NoError(t, err)
		assert.NotContains(t, string(encoded), plainKey, "审计里不能出现明文 key")
	}
	assert.ElementsMatch(t, []string{"enterprise.member.create", "enterprise.token.reveal_key"}, actions)
	assert.Len(t, items(request(ownerA, http.MethodGet, "/api/enterprise/audit?p=1&page_size=20", "")), 2)
	assert.Equal(t, http.StatusForbidden, request(developer, http.MethodGet, "/api/enterprise/audit?p=1&page_size=20", "").Code)

	routes := map[string]any{}
	for _, entry := range items(request(developer, http.MethodGet, "/api/audit/self?p=1&page_size=20", "")) {
		routes[entry["action"].(string)] = entry["route"]
	}
	assert.Equal(t, map[string]any{"passkey.register": "", "access_token.use": "/api/log/self"}, routes, "外部用户只保留访问令牌记录的路由")

	adminRoutes := map[string]any{}
	for _, entry := range items(request(platformAdmin, http.MethodGet, "/api/audit?p=1&page_size=50", "")) {
		adminRoutes[entry["action"].(string)] = entry["route"]
	}
	assert.Equal(t, "/api/user/passkey", adminRoutes["passkey.register"], "平台管理员视角保留路由")
	assert.Equal(t, "/api/enterprise/tokens/:id/key", adminRoutes["enterprise.token.reveal_key"])
}
