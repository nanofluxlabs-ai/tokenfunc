package logger

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func useJSONLogFormat(t *testing.T, enabled bool) {
	t.Helper()
	previous := common.LogFormatJSON
	common.LogFormatJSON = enabled
	t.Cleanup(func() { common.LogFormatJSON = previous })
}

func captureLogWriters(t *testing.T) (*bytes.Buffer, *bytes.Buffer) {
	t.Helper()
	common.LogWriterMu.Lock()
	previousOut, previousErr := gin.DefaultWriter, gin.DefaultErrorWriter
	out, errOut := &bytes.Buffer{}, &bytes.Buffer{}
	gin.DefaultWriter, gin.DefaultErrorWriter = out, errOut
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultWriter, gin.DefaultErrorWriter = previousOut, previousErr
		common.LogWriterMu.Unlock()
	})
	return out, errOut
}

func decodeLogLine(t *testing.T, line string) map[string]any {
	t.Helper()
	var entry map[string]any
	require.NoError(t, common.Unmarshal([]byte(strings.TrimSpace(line)), &entry), "not valid JSON: %q", line)
	return entry
}

func requestContext(id string) context.Context {
	return context.WithValue(context.Background(), common.RequestIdKey, id)
}

// text 模式必须与上游格式逐字节一致，make logs 与既有子串断言的测试都依赖它
func TestLogHelperTextFormatUnchanged(t *testing.T) {
	useJSONLogFormat(t, false)
	out, errOut := captureLogWriters(t)
	LogInfo(requestContext("req-1"), "hello")
	LogWarn(nil, "count=%d", 3)
	assert.Regexp(t, `^\[INFO\] \d{4}/\d{2}/\d{2} - \d{2}:\d{2}:\d{2} \| req-1 \| hello \n$`, out.String())
	assert.Regexp(t, `^\[WARN\] \d{4}/\d{2}/\d{2} - \d{2}:\d{2}:\d{2} \| SYSTEM \| count=3 \n$`, errOut.String())
}

func TestLogHelperJSONFieldsAndLevels(t *testing.T) {
	useJSONLogFormat(t, true)
	out, errOut := captureLogWriters(t)
	LogInfo(requestContext("req-1"), "hello")
	LogWarn(requestContext("req-2"), "count=%d", 3)
	LogError(nil, "boom")

	info := decodeLogLine(t, out.String())
	assert.Equal(t, "info", info["level"])
	assert.Equal(t, "req-1", info["request_id"])
	assert.Equal(t, "hello", info["msg"])
	assert.Equal(t, common.LogServiceName, info["service"])

	lines := strings.Split(strings.TrimSpace(errOut.String()), "\n")
	require.Len(t, lines, 2)
	warn := decodeLogLine(t, lines[0])
	assert.Equal(t, "warn", warn["level"])
	assert.Equal(t, "count=3", warn["msg"], "format args must still be applied")
	errEntry := decodeLogLine(t, lines[1])
	assert.Equal(t, "error", errEntry["level"])
	_, hasRequestID := errEntry["request_id"]
	assert.False(t, hasRequestID, "no context means no request_id, not the literal SYSTEM")
}

func TestLogRelayErrorKeepsZeroUpstreamStatus(t *testing.T) {
	useJSONLogFormat(t, true)
	_, errOut := captureLogWriters(t)
	LogRelayError(requestContext("req-3"), 42, "gpt-x", 0, "dial_timeout", "upstream unreachable")
	entry := decodeLogLine(t, errOut.String())
	assert.EqualValues(t, 42, entry["channel_id"])
	assert.Equal(t, "gpt-x", entry["model"])
	assert.EqualValues(t, 0, entry["upstream_status"], "0 means no HTTP response and must not be omitted")
	assert.Equal(t, "dial_timeout", entry["error_reason"])
}

func TestLogEventUsesEnvelopeFields(t *testing.T) {
	useJSONLogFormat(t, true)
	out, errOut := captureLogWriters(t)
	LogEvent(requestContext("req-4"), "ok_event", map[string]any{"k": "v"})
	LogEventErr(requestContext("req-5"), "bad_event", errors.New("dial https://api.openai.com/v1 failed, api_key:sk-secret"), nil)

	ok := decodeLogLine(t, out.String())
	assert.Equal(t, "ok_event", ok["event"])
	assert.Equal(t, "ok_event", ok["msg"])
	assert.Equal(t, "info", ok["level"])
	assert.Equal(t, common.LogServiceName, ok["service"])
	assert.Equal(t, "req-4", ok["request_id"])
	assert.Equal(t, "v", ok["k"])
	assert.NotEmpty(t, ok["ts"])

	bad := decodeLogLine(t, errOut.String())
	assert.Equal(t, "error", bad["level"])
	message, _ := bad[FieldErrorMessage].(string)
	assert.NotContains(t, message, "api.openai.com", "upstream host must be masked")
	assert.NotContains(t, message, "sk-secret", "api key must be masked")
}

func TestLogEventTextModeDegradesToOneLine(t *testing.T) {
	useJSONLogFormat(t, false)
	out, _ := captureLogWriters(t)
	LogEvent(requestContext("req-6"), "ok_event", map[string]any{"k": "v"})
	line := out.String()
	assert.True(t, strings.HasPrefix(line, "[INFO] "))
	assert.Contains(t, line, "| req-6 | event=ok_event ")
	assert.Contains(t, line, `"k":"v"`)
}

type panicMarshaler struct{}

func (panicMarshaler) MarshalJSON() ([]byte, error) { panic("simulated marshal panic") }

// 日志构建路径的 panic 不允许泄漏给业务调用方
func TestLogEventRecoversFromMarshalPanic(t *testing.T) {
	useJSONLogFormat(t, true)
	captureLogWriters(t)
	assert.NotPanics(t, func() {
		LogEvent(nil, "test_event", map[string]any{"bad": panicMarshaler{}})
		LogEventErr(nil, "test_event_err", errors.New("boom"), map[string]any{"bad": panicMarshaler{}})
	})
}
