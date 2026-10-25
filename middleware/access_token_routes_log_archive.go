package middleware

// logs 归档清单（TokenFunc 二开，Root）的访问令牌规则：运维资源 ops
func init() {
	for key, rule := range map[string]accessTokenRouteRule{
		"GET /api/admin/log-archive/status":                accessTokenScopeRule("ops:read"),
		"GET /api/admin/log-archive/manifests":             accessTokenScopeRule("ops:read"),
		"POST /api/admin/log-archive/manifests/:day/retry": accessTokenScopeRule("ops:write"),
	} {
		accessTokenRouteRules[key] = rule
	}
}
