package model_setting

import (
	"bytes"
	"testing"

	"github.com/QuantumNous/new-api/setting/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 管理员保存的 JSON 只写 channel_types、漏写 all_channels 时，合并默认值后不能变成对全部渠道生效
func TestChatCompletionsToResponsesPolicyMergeWithoutAllChannelsStaysScoped(t *testing.T) {
	settings := defaultOpenaiSettings
	require.NoError(t, config.UpdateConfigFromMap(&settings, map[string]string{
		"chat_completions_to_responses_policy": `{"enabled":true,"channel_types":[57],"model_patterns":[".*"]}`,
	}))

	policy := settings.ChatCompletionsToResponsesPolicy
	assert.False(t, policy.AllChannels)
	assert.True(t, policy.IsChannelEnabled(9, 57), "Codex 渠道应命中")
	assert.False(t, policy.IsChannelEnabled(8, 59), "Sub2API 渠道不应命中")
}

func TestValidateChatCompletionsToResponsesPolicyJSON(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr string
	}{
		{name: "empty value is allowed", value: "  ", wantErr: ""},
		{name: "disabled policy needs no scope", value: `{"enabled":false}`, wantErr: ""},
		{name: "channel types scope", value: `{"enabled":true,"channel_types":[57]}`, wantErr: ""},
		{name: "channel ids scope", value: `{"enabled":true,"channel_ids":[8]}`, wantErr: ""},
		{name: "all channels scope", value: `{"enabled":true,"all_channels":true,"model_patterns":["^gpt-5.*$"]}`, wantErr: ""},
		{name: "enabled without scope is rejected", value: `{"enabled":true,"model_patterns":[".*"]}`, wantErr: "no channel scope"},
		{name: "invalid json is rejected", value: `{"enabled":`, wantErr: "valid JSON"},
		{name: "invalid model pattern is rejected", value: `{"enabled":true,"all_channels":true,"model_patterns":["["]}`, wantErr: "invalid model pattern"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateChatCompletionsToResponsesPolicyJSON(tc.value)
			if tc.wantErr == "" {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.wantErr)
		})
	}
}

func TestShouldPreserveThinkingSuffixExactAndRegex(t *testing.T) {
	settings := GetGlobalSettings()
	original := append([]string(nil), settings.ThinkingModelBlacklist...)
	t.Cleanup(func() { settings.ThinkingModelBlacklist = original })

	assert.True(t, ShouldPreserveThinkingSuffix("kimi-k2-thinking"))
	assert.True(t, ShouldPreserveThinkingSuffix("moonshotai/kimi-k2-thinking"))
	assert.False(t, ShouldPreserveThinkingSuffix("m@sha256:abc"))

	settings.ThinkingModelBlacklist = []string{
		"kimi-k2-thinking",
		"re:[",
		"re:",
		"re:.*@sha256:.*",
	}

	var logged bytes.Buffer
	previous := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &logged
	t.Cleanup(func() { gin.DefaultErrorWriter = previous })

	assert.True(t, ShouldPreserveThinkingSuffix("kimi-k2-thinking"))
	assert.True(t, ShouldPreserveThinkingSuffix("m@sha256:abc"))
	assert.False(t, ShouldPreserveThinkingSuffix("m@sha256"))
	assert.False(t, ShouldPreserveThinkingSuffix("qwen3-max@thinking:on"))
	require.Contains(t, logged.String(), `invalid thinking_model_blacklist regex "re:["`)
	require.Contains(t, logged.String(), `invalid thinking_model_blacklist regex "re:"`)

	settings.ThinkingModelBlacklist = []string{"re:^beta@"}
	assert.False(t, ShouldPreserveThinkingSuffix("m@sha256:abc"))
	assert.True(t, ShouldPreserveThinkingSuffix("beta@sha256:abc"))
	assert.False(t, ShouldPreserveThinkingSuffix("alpha@sha256:abc"))
}
