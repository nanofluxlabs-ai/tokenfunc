package service

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// 外部渠道健康态的失败分类（TokenFunc 二开）。
// 只有渠道真正临时或永久不可用才影响调度。判定只看标准 HTTP 状态码与网关内部的错误类型，不解析上游错误文本：
// 各家上游的报错措辞不统一，按文本定责在生产上会漏判真故障。上游把内容安全、限流包成 500 的，应在上游侧改回标准状态码。
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
	// 唯一的文本匹配：复用上游「自动禁用关键词」设置项（余额耗尽、账号被禁、无权限），由运营维护，漏判只是退回阈值计数
	if matched, _ := AcSearch(strings.ToLower(err.Error()), operation_setting.AutomaticDisableKeywords, true); matched {
		return ChannelHealthVerdictPermanent
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
