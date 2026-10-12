package middleware

// 财务模块（TokenFunc 二开）的访问令牌规则：全部只读。管理员财务中心归 billing:read；
// 个人财务对账的消费账单与自己的用量日志同为 usage:read，钱包流水同充值记录为 wallet:read
func init() {
	for key, rule := range map[string]accessTokenRouteRule{
		// router/finance-router.go: /api/user/finance
		"GET /api/user/finance/usage/summary": accessTokenScopeRule("usage:read"),
		"GET /api/user/finance/usage/daily":   accessTokenScopeRule("usage:read"),
		"GET /api/user/finance/usage/detail":  accessTokenScopeRule("usage:read"),
		"GET /api/user/finance/usage/export":  accessTokenScopeRule("usage:read"),
		"GET /api/user/finance/topup/summary": accessTokenScopeRule("wallet:read"),
		"GET /api/user/finance/topup/detail":  accessTokenScopeRule("wallet:read"),
		"GET /api/user/finance/topup/export":  accessTokenScopeRule("wallet:read"),
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
