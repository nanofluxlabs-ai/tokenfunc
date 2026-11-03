package service

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// 外部渠道健康态的失败分类（TokenFunc 二开）。
// 只有渠道真正临时或永久不可用才影响调度：请求本身的问题（内容安全）、上游背压（限流）、网关自身的错误都不计入。
// relay、推理探测、接口探测三个入口共用这一套判定。

// ChannelHealthVerdict 一次结果对渠道健康的影响
type ChannelHealthVerdict string

const (
	ChannelHealthVerdictOK        ChannelHealthVerdict = "ok"        // 成功
	ChannelHealthVerdictIgnore    ChannelHealthVerdict = "ignore"    // 不影响调度
	ChannelHealthVerdictTransient ChannelHealthVerdict = "transient" // 临时故障：累计失败，达阈值暂停
	ChannelHealthVerdictPermanent ChannelHealthVerdict = "permanent" // 永久故障：立即暂停
)

// ChannelHealthFailureSource 失败来自真实流量还是运营配置的探测请求：探测请求由运营控制，4xx 也说明渠道配置不可用
type ChannelHealthFailureSource int

const (
	ChannelHealthFailureFromRelay ChannelHealthFailureSource = iota
	ChannelHealthFailureFromProbe
)

// channelHealthIgnoredKeywords 命中即不计入健康失败（小写匹配）：内容安全拦截与上游限流。
// 上游中转站常把这两类错误包成 500，所以不能只看状态码。
var channelHealthIgnoredKeywords = []string{
	// 内容安全
	"1301",
	"sensitive",
	"unsafe content",
	"content filter",
	"content_filter",
	"content management policy",
	"敏感",
	"不安全",
	// 限流 / 并发
	"rate limit",
	"rate_limit",
	"ratelimit",
	"concurrency limit",
	"concurrent",
	"too many requests",
	"请求过于频繁",
	"并发",
}

// ClassifyChannelHealthFailure 判定一次失败对渠道健康的影响
func ClassifyChannelHealthFailure(err *types.NewAPIError, source ChannelHealthFailureSource) ChannelHealthVerdict {
	if err == nil {
		return ChannelHealthVerdictOK
	}
	// 渠道级错误（密钥不可用、参数 / 请求头覆盖非法、模型映射错误）：渠道配置坏了，立即暂停
	if types.IsChannelError(err) {
		return ChannelHealthVerdictPermanent
	}
	// 传输层失败（连不上、超时）：临时不可用
	if err.GetErrorCode() == types.ErrorCodeDoRequestFailed {
		return ChannelHealthVerdictTransient
	}
	// 网关自身的错误（计 token、序列化、定价、请求转换等）：不是渠道的问题
	if err.GetErrorType() == types.ErrorTypeNewAPIError {
		return ChannelHealthVerdictIgnore
	}
	message := strings.ToLower(err.Error())
	// 永久故障关键词与上游「自动禁用」共用一套：余额耗尽、账号被禁、无权限
	if matched, _ := AcSearch(message, operation_setting.AutomaticDisableKeywords, true); matched {
		return ChannelHealthVerdictPermanent
	}
	if matched, _ := AcSearch(message, channelHealthIgnoredKeywords, true); matched {
		return ChannelHealthVerdictIgnore
	}
	switch {
	case err.StatusCode == http.StatusUnauthorized:
		return ChannelHealthVerdictPermanent
	case err.StatusCode == http.StatusTooManyRequests:
		return ChannelHealthVerdictIgnore
	case err.StatusCode == http.StatusRequestTimeout || err.StatusCode >= 500:
		return ChannelHealthVerdictTransient
	case err.StatusCode >= 400 && err.StatusCode < 500:
		// 真实流量的 4xx 是用户请求的问题；探测请求由运营控制，4xx 说明配置的模型在这个渠道上不可用
		if source == ChannelHealthFailureFromProbe {
			return ChannelHealthVerdictTransient
		}
		return ChannelHealthVerdictIgnore
	}
	return ChannelHealthVerdictTransient
}

// ClassifyChannelApiProbeStatus 接口探测（GET 接口）的判定：网络错误由调用方直接按临时故障处理
func ClassifyChannelApiProbeStatus(statusCode int) ChannelHealthVerdict {
	switch {
	case statusCode >= 200 && statusCode < 300:
		return ChannelHealthVerdictOK
	case statusCode == http.StatusUnauthorized:
		return ChannelHealthVerdictPermanent
	case statusCode == http.StatusForbidden, statusCode == http.StatusRequestTimeout, statusCode >= 500:
		return ChannelHealthVerdictTransient
	default:
		// 404 只说明上游不提供这个接口，429 是限流，其余 4xx 也不是接口不可达
		return ChannelHealthVerdictIgnore
	}
}
