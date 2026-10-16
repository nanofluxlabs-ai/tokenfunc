package service

import (
	"strings"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/gin-gonic/gin"
)

// 客户端来源分类值，写入 other.client_source；前端据此打标签。
const (
	LogClientSourceCodex   = "codex"
	LogClientSourceBrowser = "browser"
	LogClientSourceCurl    = "curl"
	LogClientSourcePostman = "postman"
	LogClientSourcePython  = "python"
	LogClientSourceGo      = "go"
	LogClientSourceOkHttp  = "okhttp"
	LogClientSourceUnknown = "unknown"
)

type logClientInfo struct {
	Source     string
	Platform   string
	Originator string
	UserAgent  string
}

// AppendLogClientInfo 把发起请求的客户端特征（来源分类、平台、Originator、User-Agent）
// 写入日志的公开区，供用户与管理员排查「这条调用是谁、用什么打的」。
// 优先读 relayInfo 克隆的请求头，拿不到时回落到 gin 上下文。
func AppendLogClientInfo(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, other *model.LogOther) {
	if other == nil {
		return
	}
	info := classifyLogClient(collectLogClientHeaders(ctx, relayInfo))
	other.SetPublic("client_source", info.Source)
	other.SetPublic("client_platform", info.Platform)
	if info.Originator != "" {
		other.SetPublic("client_originator", info.Originator)
	}
	if info.UserAgent != "" {
		other.SetPublic("client_user_agent", info.UserAgent)
	}
}

func collectLogClientHeaders(ctx *gin.Context, relayInfo *relaycommon.RelayInfo) map[string]string {
	if relayInfo != nil && len(relayInfo.RequestHeaders) > 0 {
		return relayInfo.RequestHeaders
	}
	if ctx == nil || ctx.Request == nil || len(ctx.Request.Header) == 0 {
		return nil
	}
	headers := make(map[string]string, len(ctx.Request.Header))
	for key := range ctx.Request.Header {
		if value := strings.TrimSpace(ctx.Request.Header.Get(key)); value != "" {
			headers[key] = value
		}
	}
	return headers
}

func classifyLogClient(headers map[string]string) logClientInfo {
	normalized := normalizeLogClientHeaders(headers)
	originator := headerValue(normalized, "originator")
	userAgent := headerValue(normalized, "user-agent")
	return logClientInfo{
		Source:     classifyLogClientSource(normalized, originator, userAgent),
		Platform:   classifyLogClientPlatform(normalized, userAgent),
		Originator: originator,
		UserAgent:  userAgent,
	}
}

// normalizeLogClientHeaders 把头名统一为小写，便于后续按固定键查找。
func normalizeLogClientHeaders(headers map[string]string) map[string]string {
	if len(headers) == 0 {
		return nil
	}
	normalized := make(map[string]string, len(headers))
	for key, value := range headers {
		key = strings.ToLower(strings.TrimSpace(key))
		value = strings.TrimSpace(value)
		if key == "" || value == "" {
			continue
		}
		normalized[key] = value
	}
	return normalized
}

func headerValue(headers map[string]string, key string) string {
	return strings.TrimSpace(headers[strings.ToLower(key)])
}

func hasHeaderPrefix(headers map[string]string, prefix string) bool {
	prefix = strings.ToLower(prefix)
	for key := range headers {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

func classifyLogClientSource(headers map[string]string, originator string, userAgent string) string {
	originatorLower := strings.ToLower(originator)
	userAgentLower := strings.ToLower(userAgent)

	// Codex CLI 会带 Originator / session_id / x-codex-* 头，优先于 UA 判定
	if strings.Contains(originatorLower, "codex") ||
		headerValue(headers, "session_id") != "" ||
		hasHeaderPrefix(headers, "x-codex-") {
		return LogClientSourceCodex
	}

	switch {
	case strings.Contains(userAgentLower, "postmanruntime"):
		return LogClientSourcePostman
	case strings.Contains(userAgentLower, "curl/"), strings.Contains(userAgentLower, "libcurl"):
		return LogClientSourceCurl
	case strings.Contains(userAgentLower, "python-requests"),
		strings.Contains(userAgentLower, "python-httpx"),
		strings.Contains(userAgentLower, "httpx"),
		strings.Contains(userAgentLower, "aiohttp"):
		return LogClientSourcePython
	case strings.Contains(userAgentLower, "go-http-client"):
		return LogClientSourceGo
	case strings.Contains(userAgentLower, "okhttp"):
		return LogClientSourceOkHttp
	}

	if isBrowserLikeRequest(headers, originatorLower, userAgentLower) {
		return LogClientSourceBrowser
	}
	return LogClientSourceUnknown
}

func isBrowserLikeRequest(headers map[string]string, originator string, userAgent string) bool {
	if strings.Contains(originator, "browser") || strings.Contains(originator, "web") {
		return true
	}
	if headerValue(headers, "sec-ch-ua") != "" ||
		headerValue(headers, "sec-fetch-site") != "" ||
		headerValue(headers, "sec-fetch-mode") != "" ||
		headerValue(headers, "origin") != "" ||
		headerValue(headers, "referer") != "" {
		return true
	}
	return strings.Contains(userAgent, "mozilla/") ||
		strings.Contains(userAgent, "chrome/") ||
		strings.Contains(userAgent, "safari/") ||
		strings.Contains(userAgent, "firefox/") ||
		strings.Contains(userAgent, "edg/")
}

func classifyLogClientPlatform(headers map[string]string, userAgent string) string {
	if platform := normalizeLogClientPlatform(headerValue(headers, "sec-ch-ua-platform")); platform != "" {
		return platform
	}
	userAgentLower := strings.ToLower(userAgent)
	switch {
	case strings.Contains(userAgentLower, "android"):
		return "android"
	case strings.Contains(userAgentLower, "iphone"),
		strings.Contains(userAgentLower, "ipad"),
		strings.Contains(userAgentLower, "ios"):
		return "ios"
	case strings.Contains(userAgentLower, "macintosh"),
		strings.Contains(userAgentLower, "mac os x"),
		strings.Contains(userAgentLower, "darwin"):
		return "macos"
	case strings.Contains(userAgentLower, "windows"):
		return "windows"
	case strings.Contains(userAgentLower, "cros"),
		strings.Contains(userAgentLower, "chrome os"):
		return "chromeos"
	case strings.Contains(userAgentLower, "linux"),
		strings.Contains(userAgentLower, "x11"):
		return "linux"
	default:
		return LogClientSourceUnknown
	}
}

// normalizeLogClientPlatform 把 Sec-CH-UA-Platform 的带引号值归一到小写平台名。
func normalizeLogClientPlatform(platform string) string {
	platform = strings.Trim(strings.TrimSpace(platform), "\"'")
	if platform == "" {
		return ""
	}
	switch strings.ToLower(platform) {
	case "macos", "mac os", "mac os x", "macintosh":
		return "macos"
	case "windows", "win32":
		return "windows"
	case "chrome os", "chromeos":
		return "chromeos"
	default:
		return strings.ToLower(platform)
	}
}
