package middleware

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
)

// 游乐场请求要能命中高级自定义渠道的 /v1/chat/completions 路由，与上游协议（转换器）无关
func TestPlaygroundPathMatchesAdvancedCustomChatRoute(t *testing.T) {
	path := relaycommon.NormalizePlaygroundPath("/pg/chat/completions")
	for _, converter := range []string{"none", "openai_chat_completions_to_anthropic_messages", "openai_chat_completions_to_gemini_generate_content"} {
		config := &dto.AdvancedCustomConfig{Routes: []dto.AdvancedCustomRoute{
			{IncomingPath: "/v1/chat/completions", UpstreamPath: "/v1/chat/completions", Converter: converter},
		}}
		assert.True(t, config.SupportsPathForModel(path, "gpt-5.6-terra"), converter)
	}

	// 只配了原生 Claude 入口的渠道，游乐场（只发 OpenAI Chat）不应调度到
	claudeOnly := &dto.AdvancedCustomConfig{Routes: []dto.AdvancedCustomRoute{
		{IncomingPath: "/v1/messages", UpstreamPath: "/v1/messages"},
	}}
	assert.False(t, claudeOnly.SupportsPathForModel(path, "claude-sonnet-5-5"))
}
