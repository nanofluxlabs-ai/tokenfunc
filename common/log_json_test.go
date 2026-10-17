package common

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func decodeLogLine(t *testing.T, line string) map[string]any {
	t.Helper()
	var entry map[string]any
	require.NoError(t, Unmarshal([]byte(line), &entry), "not valid JSON: %q", line)
	return entry
}

func useJSONLogFormat(t *testing.T, enabled bool) {
	t.Helper()
	previous := LogFormatJSON
	LogFormatJSON = enabled
	t.Cleanup(func() { LogFormatJSON = previous })
}

func captureLogWriters(t *testing.T) (*bytes.Buffer, *bytes.Buffer) {
	t.Helper()
	LogWriterMu.Lock()
	previousOut, previousErr := gin.DefaultWriter, gin.DefaultErrorWriter
	out, errOut := &bytes.Buffer{}, &bytes.Buffer{}
	gin.DefaultWriter, gin.DefaultErrorWriter = out, errOut
	LogWriterMu.Unlock()
	t.Cleanup(func() {
		LogWriterMu.Lock()
		gin.DefaultWriter, gin.DefaultErrorWriter = previousOut, previousErr
		LogWriterMu.Unlock()
	})
	return out, errOut
}

func TestWriteJSONLogSchema(t *testing.T) {
	var buf bytes.Buffer
	WriteJSONLog(&buf, LogEntry{Level: "error", RequestID: "req-1", Msg: "boom"})
	out := buf.String()
	require.True(t, strings.HasSuffix(out, "\n"))
	assert.Zero(t, strings.Count(strings.TrimRight(out, "\n"), "\n"), "must be a single line")

	entry := decodeLogLine(t, out)
	assert.Equal(t, LogServiceName, entry["service"])
	assert.Equal(t, "error", entry["level"])
	assert.Equal(t, "req-1", entry["request_id"])
	assert.Equal(t, "boom", entry["msg"])
	ts, _ := entry["ts"].(string)
	parsed, err := time.Parse(LogTimeFormat, ts)
	require.NoError(t, err, "ts %q must be RFC3339 with milliseconds", ts)
	assert.WithinDuration(t, time.Now(), parsed, time.Minute)
	for _, absent := range []string{"status", "component", "stack", "user_id", "upstream_status"} {
		_, present := entry[absent]
		assert.False(t, present, "%s should be omitted when empty", absent)
	}
}

func TestWriteJSONLogDefaultsLevelToInfo(t *testing.T) {
	var buf bytes.Buffer
	WriteJSONLog(&buf, LogEntry{Msg: "no level"})
	assert.Equal(t, "info", decodeLogLine(t, buf.String())["level"])
}

func TestSysLogFormatSwitch(t *testing.T) {
	useJSONLogFormat(t, false)
	out, errOut := captureLogWriters(t)
	SysLog("hello")
	SysError("bad")
	assert.Regexp(t, `^\[SYS\] \d{4}/\d{2}/\d{2} - \d{2}:\d{2}:\d{2} \| hello \n$`, out.String())
	assert.Regexp(t, `^\[SYS\] \d{4}/\d{2}/\d{2} - \d{2}:\d{2}:\d{2} \| bad \n$`, errOut.String())

	useJSONLogFormat(t, true)
	out, errOut = captureLogWriters(t)
	SysLog("hello")
	SysWarn("careful")
	SysError("bad")
	assert.Equal(t, "info", decodeLogLine(t, out.String())["level"])
	lines := strings.Split(strings.TrimSpace(errOut.String()), "\n")
	require.Len(t, lines, 2)
	assert.Equal(t, "warn", decodeLogLine(t, lines[0])["level"])
	assert.Equal(t, "error", decodeLogLine(t, lines[1])["level"])
	assert.Equal(t, "bad", decodeLogLine(t, lines[1])["msg"])
}

func TestLogPanicFlattensAndTruncatesStack(t *testing.T) {
	useJSONLogFormat(t, true)
	_, errOut := captureLogWriters(t)
	stack := strings.Repeat("goroutine 1 [running]:\nmain.main()\n", 600)
	LogPanic("req-9", "nil map", []byte(stack))

	entry := decodeLogLine(t, errOut.String())
	assert.Equal(t, "error", entry["level"])
	assert.Equal(t, "req-9", entry["request_id"])
	assert.Equal(t, "panic detected: nil map", entry["msg"])
	flat, _ := entry["stack"].(string)
	assert.NotContains(t, flat, "\n")
	assert.True(t, strings.HasSuffix(flat, "...(truncated)"))
	assert.LessOrEqual(t, len(flat), logStackMaxLen+len("...(truncated)"))
}

func TestDynamicLogWriterFollowsWriterSwap(t *testing.T) {
	first, _ := captureLogWriters(t)
	writer := InfoLogWriter()
	_, _ = writer.Write([]byte("one\n"))
	second, _ := captureLogWriters(t)
	_, _ = writer.Write([]byte("two\n"))
	assert.Equal(t, "one\n", first.String())
	assert.Equal(t, "two\n", second.String(), "writes after a swap must reach the new writer")
}
