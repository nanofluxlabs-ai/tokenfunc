package middleware

// 企业模块（TokenFunc 二开）的访问令牌规则单独声明，避免改动上游的 accessTokenRouteRules 字面量
func init() {
	for key, rule := range map[string]accessTokenRouteRule{
		// router/enterprise-router.go: /api/admin/enterprise
		"GET /api/admin/enterprise/enterprises":                    accessTokenScopeRule("user:read"),
		"POST /api/admin/enterprise/enterprises":                   accessTokenScopeRule("user:write"),
		"GET /api/admin/enterprise/enterprises/:id":                accessTokenScopeRule("user:read"),
		"PUT /api/admin/enterprise/enterprises/:id":                accessTokenScopeRule("user:write"),
		"PUT /api/admin/enterprise/enterprises/:id/credit":         accessTokenScopeRule("billing:write"),
		"DELETE /api/admin/enterprise/enterprises/:id/credit":      accessTokenScopeRule("billing:write"),
		"PUT /api/admin/enterprise/enterprises/:id/status":         accessTokenScopeRule("user:write"),
		"POST /api/admin/enterprise/enterprises/:id/topup":         accessTokenScopeRule("billing:write"),
		"GET /api/admin/enterprise/enterprises/:id/ledger":         accessTokenScopeRule("billing:read"),
		"GET /api/admin/enterprise/enterprises/:id/credit-periods": accessTokenScopeRule("billing:read"),

		// router/enterprise-router.go: /api/enterprise（企业控制台，支持带 enterprise:* 作用域的访问令牌做自动化）
		"GET /api/enterprise/self":                  accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/overview":              accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/ledger":                accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/credit-periods":        accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/departments":           accessTokenScopeRule("enterprise:read"),
		"POST /api/enterprise/departments":          accessTokenScopeRule("enterprise:write"),
		"PUT /api/enterprise/departments/:id":       accessTokenScopeRule("enterprise:write"),
		"DELETE /api/enterprise/departments/:id":    accessTokenScopeRule("enterprise:write"),
		"GET /api/enterprise/employees":             accessTokenScopeRule("enterprise:read"),
		"POST /api/enterprise/employees":            accessTokenScopeRule("enterprise:write"),
		"POST /api/enterprise/employees/import":     accessTokenScopeRule("enterprise:write"),
		"PUT /api/enterprise/employees/:id":         accessTokenScopeRule("enterprise:write"),
		"DELETE /api/enterprise/employees/:id":      accessTokenScopeRule("enterprise:write"),
		"GET /api/enterprise/projects":              accessTokenScopeRule("enterprise:read"),
		"POST /api/enterprise/projects":             accessTokenScopeRule("enterprise:write"),
		"PUT /api/enterprise/projects/:id":          accessTokenScopeRule("enterprise:write"),
		"DELETE /api/enterprise/projects/:id":       accessTokenScopeRule("enterprise:write"),
		"GET /api/enterprise/tokens":                accessTokenScopeRule("enterprise:read"),
		"POST /api/enterprise/tokens":               accessTokenScopeRule("enterprise:write"),
		"PUT /api/enterprise/tokens/:id/assignment": accessTokenScopeRule("enterprise:write"),
	} {
		accessTokenRouteRules[key] = rule
	}
}
