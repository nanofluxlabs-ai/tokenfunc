package middleware

// 企业模块（TokenFunc 二开）的访问令牌规则单独声明，避免改动上游的 accessTokenRouteRules 字面量
func init() {
	for key, rule := range map[string]accessTokenRouteRule{
		// router/enterprise-router.go: /api/admin/enterprise
		"GET /api/admin/enterprise/enterprises":     accessTokenScopeRule("user:read"),
		"POST /api/admin/enterprise/enterprises":    accessTokenScopeRule("user:write"),
		"GET /api/admin/enterprise/enterprises/:id": accessTokenScopeRule("user:read"),
		"PUT /api/admin/enterprise/enterprises/:id": accessTokenScopeRule("user:write"),
	} {
		accessTokenRouteRules[key] = rule
	}
}
