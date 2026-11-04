package common

import "strings"

// NormalizePlaygroundPath 游乐场 /pg/... 对应的 /v1/... 路径（TokenFunc 二开）。
// 与 genBaseRelayInfo 的改写一致；调度、适配器匹配高级自定义渠道路由时都要用改写后的路径，
// 否则 /v1/... 路由永远匹配不上。
func NormalizePlaygroundPath(path string) string {
	if rest, ok := strings.CutPrefix(path, "/pg/"); ok {
		return "/v1/" + rest
	}
	return path
}
