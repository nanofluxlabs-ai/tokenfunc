package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"

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
