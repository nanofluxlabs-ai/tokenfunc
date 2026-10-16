package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClassifyLogClient(t *testing.T) {
	testCases := []struct {
		name       string
		headers    map[string]string
		source     string
		platform   string
		originator string
		userAgent  string
	}{
		{
			name: "codex request is identified by originator before user agent",
			headers: map[string]string{
				"Originator": "Codex CLI",
				"Session_id": "sess-123",
				"User-Agent": "codex-cli/1.0.0",
			},
			source:     LogClientSourceCodex,
			platform:   "unknown",
			originator: "Codex CLI",
			userAgent:  "codex-cli/1.0.0",
		},
		{
			name: "browser request takes platform from client hints",
			headers: map[string]string{
				"User-Agent":         "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
				"Sec-CH-UA":          "\"Chromium\";v=\"136\"",
				"Sec-CH-UA-Platform": "\"macOS\"",
			},
			source:    LogClientSourceBrowser,
			platform:  "macos",
			userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
		},
		{
			name:      "python sdk request",
			headers:   map[string]string{"User-Agent": "python-requests/2.32.3"},
			source:    LogClientSourcePython,
			platform:  "unknown",
			userAgent: "python-requests/2.32.3",
		},
		{
			name:      "curl on linux falls back to user agent platform",
			headers:   map[string]string{"User-Agent": "curl/8.7.1 (x86_64-pc-linux-gnu)"},
			source:    LogClientSourceCurl,
			platform:  "linux",
			userAgent: "curl/8.7.1 (x86_64-pc-linux-gnu)",
		},
		{
			name:     "no headers at all",
			headers:  nil,
			source:   LogClientSourceUnknown,
			platform: "unknown",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			info := classifyLogClient(tc.headers)
			assert.Equal(t, tc.source, info.Source)
			assert.Equal(t, tc.platform, info.Platform)
			assert.Equal(t, tc.originator, info.Originator)
			assert.Equal(t, tc.userAgent, info.UserAgent)
		})
	}
}

func TestAppendLogClientInfoPrefersRelayInfoHeaders(t *testing.T) {
	other := model.NewLogOther()
	relayInfo := &relaycommon.RelayInfo{
		RequestHeaders: map[string]string{
			"Originator": "Codex CLI",
			"Session_id": "sess-legacy",
		},
	}

	AppendLogClientInfo(nil, relayInfo, other)

	snapshot := other.Snapshot()
	assert.Equal(t, LogClientSourceCodex, snapshot["client_source"])
	assert.Equal(t, "unknown", snapshot["client_platform"])
	assert.Equal(t, "Codex CLI", snapshot["client_originator"])
	_, hasUserAgent := snapshot["client_user_agent"]
	assert.False(t, hasUserAgent, "空 User-Agent 不应写入")
}

func TestAppendLogClientInfoFallsBackToRequestHeaders(t *testing.T) {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	ctx.Request.Header.Set("User-Agent", "Go-http-client/1.1")

	other := model.NewLogOther()
	AppendLogClientInfo(ctx, nil, other)

	snapshot := other.Snapshot()
	require.Equal(t, LogClientSourceGo, snapshot["client_source"])
	assert.Equal(t, "unknown", snapshot["client_platform"])
	assert.Equal(t, "Go-http-client/1.1", snapshot["client_user_agent"])
}
