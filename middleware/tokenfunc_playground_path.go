package middleware

import "strings"

// channelFilterRequestPath 调度时用于匹配高级自定义渠道路由的请求路径（TokenFunc 二开）。
// 游乐场走 /pg/...，转发阶段会改写成 /v1/...（见 relaycommon.genBaseRelayInfo）；
// 调度阶段同样改写，否则高级自定义渠道的 /v1/... 路由永远匹配不上，被当成无可用渠道。
func channelFilterRequestPath(path string) string {
	if rest, ok := strings.CutPrefix(path, "/pg/"); ok {
		return "/v1/" + rest
	}
	return path
}
