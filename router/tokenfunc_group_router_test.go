package router

import (
	"testing"

	"github.com/QuantumNous/new-api/middleware"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 分组列表是全站分组下拉的字典，不能受 group_pricing 拦截：否则取消「查看分组定价」后，
// 用户管理、渠道编辑、日志筛选一进页面就 403。handlePermissionRoute 声明的 scope 与它挂的 casbin 权限一一对应，
// 因此 scope 不是 group_pricing:* 即说明该路由不经过 group_pricing 校验。
func TestTokenFuncGroupRoutesPermissionScopes(t *testing.T) {
	newAccessTokenScopeTestEngine(t)

	cases := map[string]string{
		"GET /api/tokenfunc/groups/user":              "user:read",
		"GET /api/tokenfunc/groups/channel":           "channel:read",
		"GET /api/tokenfunc/groups/user/:key/pricing": "group_pricing:read",
		"POST /api/tokenfunc/groups/user":             "group_pricing:manage",
		"PUT /api/tokenfunc/groups/user/:key":         "group_pricing:manage",
		"PUT /api/tokenfunc/groups/user/:key/pricing": "group_pricing:price",
		"DELETE /api/tokenfunc/groups/user/:key":      "group_pricing:price",
	}
	for key, scope := range cases {
		rule, ok := middleware.AccessTokenRouteRule(key)
		require.True(t, ok, key)
		assert.Equal(t, scope, rule.Scope(), key)
	}
}
