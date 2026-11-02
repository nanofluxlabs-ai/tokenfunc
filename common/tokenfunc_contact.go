package common

import "strings"

// NormalizeTelegramUsername 把管理员填写的 Telegram 联系方式规范成纯用户名：
// 接受 @name、name、t.me/name、https://t.me/name（可带查询串或尾部斜杠）。
// 只保留 Telegram 用户名允许的字母、数字、下划线，前端直接拼 https://t.me/<name> 不会被注入。
func NormalizeTelegramUsername(raw string) string {
	value := strings.TrimSpace(raw)
	for _, prefix := range []string{"https://", "http://"} {
		value, _ = strings.CutPrefix(value, prefix)
	}
	for _, prefix := range []string{"www.t.me/", "t.me/", "telegram.me/"} {
		if rest, ok := strings.CutPrefix(value, prefix); ok {
			value = rest
			break
		}
	}
	value = strings.TrimPrefix(value, "@")
	if before, _, found := strings.Cut(value, "?"); found {
		value = before
	}
	value = strings.Trim(value, "/")
	var builder strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			builder.WriteRune(r)
			continue
		}
		// 遇到第一个非法字符就截断，避免把路径片段拼进用户名
		break
	}
	return builder.String()
}
