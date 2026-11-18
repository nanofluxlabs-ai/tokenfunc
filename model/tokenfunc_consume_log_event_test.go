package model

import (
	"bytes"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 消费事件的字段名是 CLS 索引契约：缓存读写、计量语义、上游 ID 必须是顶层字段，content 不得出现
func TestLogConsumeEventEmitsStructuredFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousFormat := common.LogFormatJSON
	common.LogFormatJSON = true
	t.Cleanup(func() { common.LogFormatJSON = previousFormat })
	previousWriter := gin.DefaultWriter
	var output bytes.Buffer
	gin.DefaultWriter = &output
	t.Cleanup(func() { gin.DefaultWriter = previousWriter })

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/messages", nil)
	c.Set(common.RequestIdKey, "gateway-request-id")
	c.Set(common.UpstreamRequestIdKey, "upstream-request-id")

	other := NewLogOther()
	other.SetPublic("cache_tokens", 9000)
	other.SetPublic("cache_write_tokens", 300)
	other.SetPublic("usage_semantic", "anthropic")
	other.SetPublic("frt", float64(850))
	other.SetPublic("upstream_model_name", "claude-sonnet-5-5")
	other.SetAdmin("use_channel", []string{"12"})

	logConsumeEvent(c, 7, RecordConsumeLogParams{
		ChannelId:        12,
		PromptTokens:     100,
		CompletionTokens: 50,
		ModelName:        "claude-sonnet-5-5",
		Quota:            1234,
		Content:          []*common.Message{common.NewMessage("never-log-this")},
		TokenId:          3,
		UseTimeSeconds:   4,
		IsStream:         true,
		Group:            "default",
		Other:            other,
	})

	var entry map[string]any
	require.NoError(t, common.Unmarshal(bytes.TrimSpace(output.Bytes()), &entry), output.String())
	assert.Equal(t, "consume", entry["event"])
	assert.Equal(t, "gateway-request-id", entry["request_id"])
	assert.Equal(t, "upstream-request-id", entry["upstream_request_id"])
	assert.EqualValues(t, 7, entry["user_id"])
	assert.EqualValues(t, 12, entry["channel_id"])
	assert.Equal(t, "claude-sonnet-5-5", entry["model"])
	assert.EqualValues(t, 100, entry["prompt_tokens"])
	assert.EqualValues(t, 50, entry["completion_tokens"])
	assert.EqualValues(t, 9000, entry["cache_tokens"])
	assert.EqualValues(t, 300, entry["cache_write_tokens"])
	assert.Equal(t, "anthropic", entry["usage_semantic"])
	assert.EqualValues(t, 850, entry["frt_ms"])
	assert.EqualValues(t, 1234, entry["quota_consumed"])
	assert.Equal(t, true, entry["is_stream"])
	assert.NotContains(t, output.String(), "never-log-this")
	assert.NotContains(t, output.String(), "use_channel")
}
