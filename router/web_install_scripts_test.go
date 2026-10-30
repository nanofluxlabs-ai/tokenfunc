package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRenderInstallScriptFillsSiteAndJoinsCommonPart(t *testing.T) {
	for _, script := range []string{"claude-code.sh", "codex.sh", "claude-code.ps1", "codex.ps1"} {
		text, ok := renderInstallScript(script, "https://api.example.com", "Acme")
		require.True(t, ok, script)
		assert.NotContains(t, text, installBaseURLPlaceholder, script)
		assert.NotContains(t, text, installSiteNamePlaceholder, script)
		assert.Contains(t, text, "https://api.example.com", script)
		// 公共部分（读密钥、校验 /v1/models）必须拼在前面
		assert.Contains(t, text, "/v1/models", script)
	}
}

func TestRenderInstallScriptWrapsPowerShellInScriptBlock(t *testing.T) {
	text, ok := renderInstallScript("codex.ps1", "https://api.example.com", "Acme")
	require.True(t, ok)
	assert.True(t, strings.HasPrefix(text, "& {\n"))
	assert.True(t, strings.HasSuffix(strings.TrimSpace(text), "}"))

	sh, ok := renderInstallScript("codex.sh", "https://api.example.com", "Acme")
	require.True(t, ok)
	assert.True(t, strings.HasPrefix(sh, "#!/usr/bin/env bash"))
}

func TestRenderInstallScriptStripsCharactersUnsafeInScripts(t *testing.T) {
	text, ok := renderInstallScript("claude-code.sh", "https://api.example.com", `Acme"$(rm -rf ~)`+"`x`")
	require.True(t, ok)
	assert.Contains(t, text, `TF_SITE_NAME="Acmerm -rf x"`)
	assert.NotContains(t, text, "$(rm")

	text, ok = renderInstallScript("claude-code.ps1", "https://api.example.com", `"'`)
	require.True(t, ok)
	assert.Contains(t, text, `$TfSiteName = 'tokenfunc'`)
}

func TestRenderInstallScriptRejectsUnknownScripts(t *testing.T) {
	for _, script := range []string{"cursor.sh", "claude-code.bat", "claude-code", "common.sh", "../web-router.go"} {
		_, ok := renderInstallScript(script, "https://api.example.com", "Acme")
		assert.False(t, ok, script)
	}
}

func TestServeInstallScriptReturnsPlainTextAndRejectsUnsafeHost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerInstallScriptRoutes(router)

	req := httptest.NewRequest(http.MethodGet, "/install/codex.ps1", nil)
	req.Host = "api.example.com"
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "text/plain; charset=utf-8", rec.Header().Get("Content-Type"))
	assert.Contains(t, rec.Body.String(), "$TfBaseUrl = 'http://api.example.com'")

	req = httptest.NewRequest(http.MethodGet, "/install/codex.sh", nil)
	req.Host = `evil.com"; rm -rf ~; "`
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusServiceUnavailable, rec.Code)

	req = httptest.NewRequest(http.MethodGet, "/install/unknown.sh", nil)
	req.Host = "api.example.com"
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusNotFound, rec.Code)
}
