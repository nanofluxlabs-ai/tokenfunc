package middleware

// 企业模块（TokenFunc 二开）的访问令牌规则单独声明，避免改动上游的 accessTokenRouteRules 字面量
func init() {
	for key, rule := range map[string]accessTokenRouteRule{
		// router/enterprise-router.go: /api/admin/enterprise
		"GET /api/admin/enterprise/enterprises":     accessTokenScopeRule("user:read"),
		"POST /api/admin/enterprise/enterprises":    accessTokenScopeRule("user:write"),
		"GET /api/admin/enterprise/enterprises/:id": accessTokenScopeRule("user:read"),
		"PUT /api/admin/enterprise/enterprises/:id": accessTokenScopeRule("user:write"),

		// router/enterprise-router.go: /api/enterprise（企业控制台，暂只允许浏览器会话）
		"GET /api/enterprise/self":                  accessTokenSessionRule,
		"GET /api/enterprise/departments":           accessTokenSessionRule,
		"POST /api/enterprise/departments":          accessTokenSessionRule,
		"PUT /api/enterprise/departments/:id":       accessTokenSessionRule,
		"DELETE /api/enterprise/departments/:id":    accessTokenSessionRule,
		"GET /api/enterprise/employees":             accessTokenSessionRule,
		"POST /api/enterprise/employees":            accessTokenSessionRule,
		"PUT /api/enterprise/employees/:id":         accessTokenSessionRule,
		"DELETE /api/enterprise/employees/:id":      accessTokenSessionRule,
		"GET /api/enterprise/projects":              accessTokenSessionRule,
		"POST /api/enterprise/projects":             accessTokenSessionRule,
		"PUT /api/enterprise/projects/:id":          accessTokenSessionRule,
		"DELETE /api/enterprise/projects/:id":       accessTokenSessionRule,
		"GET /api/enterprise/tokens":                accessTokenSessionRule,
		"POST /api/enterprise/tokens":               accessTokenSessionRule,
		"PUT /api/enterprise/tokens/:id/assignment": accessTokenSessionRule,
	} {
		accessTokenRouteRules[key] = rule
	}
}
