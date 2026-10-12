package middleware

// 财务中心（TokenFunc 二开）的访问令牌规则：全部只读，归 billing:read
func init() {
	for key, rule := range map[string]accessTokenRouteRule{
		// router/finance-router.go: /api/admin/finance
		"GET /api/admin/finance/overview":           accessTokenScopeRule("billing:read"),
		"GET /api/admin/finance/orders":             accessTokenScopeRule("billing:read"),
		"GET /api/admin/finance/user-consumptions":  accessTokenScopeRule("billing:read"),
		"GET /api/admin/finance/model-consumptions": accessTokenScopeRule("billing:read"),
		"GET /api/admin/finance/usage/summary":      accessTokenScopeRule("billing:read"),
		"GET /api/admin/finance/usage/daily":        accessTokenScopeRule("billing:read"),
		"GET /api/admin/finance/usage/detail":       accessTokenScopeRule("billing:read"),
		"GET /api/admin/finance/usage/export":       accessTokenScopeRule("billing:read"),
		"GET /api/admin/finance/bills":              accessTokenScopeRule("billing:read"),
		"GET /api/admin/finance/bills/:kind/:id":    accessTokenScopeRule("billing:read"),
	} {
		accessTokenRouteRules[key] = rule
	}
}
