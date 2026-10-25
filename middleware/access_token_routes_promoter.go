package middleware

// 推广人模块（TokenFunc 二开）的访问令牌规则单独声明，避免改动上游的 accessTokenRouteRules 字面量。
// 自助接口按「读本人用量」归 usage:read；管理端按用户管理 user:read / user:write，消耗统计 usage:read。
func init() {
	for key, rule := range map[string]accessTokenRouteRule{
		// router/promoter-router.go: /api/promoter
		"GET /api/promoter/self":                        accessTokenScopeRule("profile:read"),
		"GET /api/promoter/center/overview":             accessTokenScopeRule("usage:read"),
		"GET /api/promoter/center/users":                accessTokenScopeRule("usage:read"),
		"GET /api/promoter/center/models":               accessTokenScopeRule("usage:read"),
		"GET /api/promoter/center/users/:user_id/usage": accessTokenScopeRule("usage:read"),

		// router/promoter-router.go: /api/admin/promoter
		"GET /api/admin/promoter/promoters":                                 accessTokenScopeRule("user:read"),
		"POST /api/admin/promoter/promoters":                                accessTokenScopeRule("user:write"),
		"PUT /api/admin/promoter/promoters/:id":                             accessTokenScopeRule("user:write"),
		"DELETE /api/admin/promoter/promoters/:id":                          accessTokenScopeRule("user:write"),
		"GET /api/admin/promoter/promoters/:id/bindings":                    accessTokenScopeRule("user:read"),
		"POST /api/admin/promoter/promoters/:id/bindings":                   accessTokenScopeRule("user:write"),
		"DELETE /api/admin/promoter/promoters/:id/bindings/:user_id":        accessTokenScopeRule("user:write"),
		"GET /api/admin/promoter/promoters/:id/center/overview":             accessTokenScopeRule("usage:read"),
		"GET /api/admin/promoter/promoters/:id/center/users":                accessTokenScopeRule("usage:read"),
		"GET /api/admin/promoter/promoters/:id/center/models":               accessTokenScopeRule("usage:read"),
		"GET /api/admin/promoter/promoters/:id/center/users/:user_id/usage": accessTokenScopeRule("usage:read"),
	} {
		accessTokenRouteRules[key] = rule
	}
}
