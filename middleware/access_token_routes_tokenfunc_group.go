package middleware

// 分组定价（TokenFunc 二开）里不走 casbin 权限的路由，访问令牌规则在这里单独声明；
// 其余 /api/tokenfunc/groups 管理接口由 handlePermissionRoute 按 group_pricing 权限自动声明。
func init() {
	for key, rule := range map[string]accessTokenRouteRule{
		// 令牌分组下拉：登录用户读自己可选的渠道分组
		"GET /api/tokenfunc/groups/self": accessTokenScopeRule("profile:read"),
		// 统一保存会写 GroupRatio 等全局 option，与 PUT /api/option/ 同一 scope
		"PUT /api/tokenfunc/groups/settings": accessTokenScopeRule("option:write"),
	} {
		accessTokenRouteRules[key] = rule
	}
}
