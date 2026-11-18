package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/gin-gonic/gin"
)

// logConsumeEvent 把消费日志输出成一行结构化事件（TokenFunc 二开，JSON 日志模式）。
// text 模式仍走上游的 "record consume log" 文本行；字段名与 CLS 主题 tokenfunc-api 的索引一致，
// 改名要同步工作区 docs/runbooks/cls/indexes.py。只放排障需要的计量字段，不带 content 与 admin/root 信息。
func logConsumeEvent(c *gin.Context, userId int, params RecordConsumeLogParams) {
	fields := map[string]any{
		logger.FieldUserID:           userId,
		logger.FieldTokenID:          params.TokenId,
		logger.FieldChannelID:        params.ChannelId,
		logger.FieldModel:            params.ModelName,
		logger.FieldGroup:            params.Group,
		logger.FieldIsStream:         params.IsStream,
		logger.FieldPromptTokens:     params.PromptTokens,
		logger.FieldCompletionTokens: params.CompletionTokens,
		logger.FieldQuotaConsumed:    params.Quota,
		logger.FieldUseTimeSeconds:   params.UseTimeSeconds,
		logger.FieldUsageSemantic:    "openai",
	}
	if id := c.GetString(common.UpstreamRequestIdKey); id != "" {
		fields[logger.FieldUpstreamReqID] = id
	}
	if other := params.Other; other != nil {
		cacheTokens, _ := other.public["cache_tokens"].(int)
		fields[logger.FieldCacheTokens] = cacheTokens
		// 结算路径已把 5m/1h 合计进 cache_write_tokens，这里不再相加
		cacheWriteTokens, _ := other.public["cache_write_tokens"].(int)
		fields[logger.FieldCacheWriteTokens] = cacheWriteTokens
		if semantic, ok := other.public["usage_semantic"].(string); ok && semantic != "" {
			fields[logger.FieldUsageSemantic] = semantic
		}
		if frt, ok := other.public["frt"].(float64); ok && frt > 0 {
			fields[logger.FieldFirstResponseMs] = frt
		}
		if upstreamModel, ok := other.public["upstream_model_name"].(string); ok && upstreamModel != "" {
			fields[logger.FieldUpstreamModel] = upstreamModel
		}
		if effort, ok := other.public["reasoning_effort"].(string); ok && effort != "" {
			fields[logger.FieldReasoningEffort] = effort
		}
	}
	logger.LogEvent(c, logger.EventConsume, fields)
}
