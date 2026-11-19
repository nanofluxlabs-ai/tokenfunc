package jsplugin

// TokenFunc 二开：二开控制台页与文档中心同样是插件路由不能进入的命名空间，
// 否则插件路由会抢走这些页面的刷新与直接访问。新增二开顶级页面时同步加在这里。
func init() {
	reservedRouteNamespaces = append(reservedRouteNamespaces,
		"/docs",
		"/enterprise",
		"/enterprise-billing",
		"/enterprise-leads",
		"/finance",
		"/log-archive",
		"/promoter-center",
		"/promoters",
		"/quotes",
		"/reconciliation",
	)
}
