package middleware

// 使用日志页统计（TokenFunc 二开）的访问令牌规则：与上游 /api/log/stat、/api/log/self/stat 同 scope
func init() {
	for key, rule := range map[string]accessTokenRouteRule{
		"GET /api/log/summary":      accessTokenScopeRule("log:read"),
		"GET /api/log/self/summary": accessTokenScopeRule("usage:read"),
	} {
		accessTokenRouteRules[key] = rule
	}
}
