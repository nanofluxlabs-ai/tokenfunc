package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
)

func abortWithOpenAiMessage(c *gin.Context, statusCode int, message string, code ...types.ErrorCode) {
	codeStr := ""
	if len(code) > 0 {
		codeStr = string(code[0])
	}
	userId := c.GetInt("id")
	_, preparedPluginRoute := c.Get(pluginruntime.ContextKeyRouteRequest)
	if !preparedPluginRoute || !RespondTaskPluginError(c, &dto.TaskError{
		Code:       codeStr,
		Message:    message,
		StatusCode: statusCode,
	}) {
		c.JSON(statusCode, gin.H{
			"error": gin.H{
				"message": common.MessageWithRequestId(message, c.GetString(common.RequestIdKey)),
				"type":    "new_api_error",
				"code":    codeStr,
			},
		})
	}
	c.Abort()
	logger.LogError(c.Request.Context(), fmt.Sprintf("user %d | %s", userId, message))
	emitAbortEvent(c, statusCode, message, codeStr)
}

// abortErrorClassKey 分发阶段在中止前写入的错误分类（如 no_available_channel），由 emitAbortEvent 带出
const abortErrorClassKey = "log_abort_error_class"

// emitAbortEvent 为认证 / 分发阶段的中止打一条结构化事件：401/403 记 auth_failed，
// 其余记 distribute_failed；429 由限流中间件单独打 rate_limited，这里不重复。
func emitAbortEvent(c *gin.Context, statusCode int, message string, errorCode string) {
	if c == nil || statusCode == http.StatusTooManyRequests {
		return
	}
	event := logger.EventDistributeFailed
	if statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden {
		event = logger.EventAuthFailed
	}
	fields := map[string]any{
		logger.FieldStatusCode: statusCode,
		logger.FieldReason:     classifyRelayRequestFailure(statusCode, errorCode, message),
	}
	if errorCode != "" {
		fields["error_code"] = errorCode
	}
	if errorClass := c.GetString(abortErrorClassKey); errorClass != "" {
		fields[logger.FieldErrorClass] = errorClass
	}
	if userId := c.GetInt("id"); userId > 0 {
		fields[logger.FieldUserID] = userId
	}
	if tokenId := c.GetInt("token_id"); tokenId > 0 {
		fields[logger.FieldTokenID] = tokenId
	}
	if tokenName := c.GetString("token_name"); tokenName != "" {
		fields[logger.FieldTokenName] = tokenName
	}
	if model := common.GetContextKeyString(c, constant.ContextKeyOriginalModel); model != "" {
		fields[logger.FieldModel] = model
	}
	group := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	if group == "" {
		group = common.GetContextKeyString(c, constant.ContextKeyTokenGroup)
	}
	if group != "" {
		fields[logger.FieldGroup] = group
	}
	if c.Request != nil && c.Request.URL != nil {
		fields[logger.FieldRoute] = c.Request.URL.Path
	}
	if ip := c.ClientIP(); ip != "" {
		fields[logger.FieldClientIP] = ip
	}
	logger.LogEvent(c, event, fields)
}

// classifyRelayRequestFailure 把中止原因收敛成可聚合的 reason 枚举
func classifyRelayRequestFailure(statusCode int, errorCode string, message string) string {
	if errorCode != "" {
		switch types.ErrorCode(errorCode) {
		case types.ErrorCodeAccessDenied:
			return "access_denied"
		case types.ErrorCodeModelNotFound:
			return "model_not_found"
		case types.ErrorCodeGetChannelFailed:
			return "channel_setup_failed"
		case types.ErrorCodeInsufficientUserQuota:
			return "insufficient_quota"
		default:
			return strings.TrimSpace(errorCode)
		}
	}
	normalized := strings.ToLower(strings.TrimSpace(message))
	switch statusCode {
	case http.StatusUnauthorized:
		return "unauthorized"
	case http.StatusForbidden:
		if strings.Contains(normalized, "ip") {
			return "ip_forbidden"
		}
		return "access_denied"
	case http.StatusTooManyRequests:
		return "rate_limited"
	case http.StatusBadRequest:
		return "invalid_request"
	case http.StatusNotFound:
		return "invalid_endpoint"
	case http.StatusServiceUnavailable:
		if strings.Contains(normalized, "overload") || strings.Contains(normalized, "负载") {
			return "system_overload"
		}
		return "service_unavailable"
	default:
		if statusCode >= http.StatusInternalServerError {
			return fmt.Sprintf("http_%d", statusCode)
		}
		return "unknown"
	}
}

func abortWithMidjourneyMessage(c *gin.Context, statusCode int, code int, description string) {
	c.JSON(statusCode, gin.H{
		"description": description,
		"type":        "new_api_error",
		"code":        code,
	})
	c.Abort()
	logger.LogError(c.Request.Context(), description)
}
