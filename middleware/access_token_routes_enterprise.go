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
		"GET /api/admin/enterprise/enterprises/:id/usage/summary":  accessTokenScopeRule("billing:read"),
		"GET /api/admin/enterprise/enterprises/:id/usage/export":   accessTokenScopeRule("billing:read"),
		"GET /api/admin/enterprise/bills":                          accessTokenScopeRule("billing:read"),
		"GET /api/admin/enterprise/bills/:id":                      accessTokenScopeRule("billing:read"),
		"POST /api/admin/enterprise/bills/:id/payments":            accessTokenScopeRule("billing:write"),
		"POST /api/admin/enterprise/bills/:id/void":                accessTokenScopeRule("billing:write"),
		"POST /api/admin/enterprise/credit-periods/:id/issue":      accessTokenScopeRule("billing:write"),
		"GET /api/admin/enterprise/reconcile/alerts":               accessTokenScopeRule("billing:read"),
		"POST /api/admin/enterprise/reconcile/alerts/:bill_id/ack": accessTokenScopeRule("billing:write"),
		"GET /api/admin/enterprise/settings/seller":                accessTokenScopeRule("billing:read"),
		"PUT /api/admin/enterprise/settings/seller":                accessTokenScopeRule("billing:write"),
		"GET /api/admin/enterprise/quotes/config":                  accessTokenScopeRule("billing:read"),
		"PUT /api/admin/enterprise/quotes/config":                  accessTokenScopeRule("billing:write"),
		"POST /api/admin/enterprise/quotes/render":                 accessTokenScopeRule("billing:read"),
		"GET /api/admin/enterprise/leads":                          accessTokenScopeRule("user:read"),
		"PUT /api/admin/enterprise/leads/:id":                      accessTokenScopeRule("user:write"),
		// 营销页匿名留资，无需作用域
		"POST /api/enterprise/leads": accessTokenAnyRule,

		// router/enterprise-router.go: /api/enterprise（企业控制台，支持带 enterprise:* 作用域的访问令牌做自动化）
		"GET /api/enterprise/self":                  accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/overview":              accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/ledger":                accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/credit-periods":        accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/usage/summary":         accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/usage/export":          accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/bills":                 accessTokenScopeRule("enterprise:read"),
		"GET /api/enterprise/bills/:id":             accessTokenScopeRule("enterprise:read"),
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
