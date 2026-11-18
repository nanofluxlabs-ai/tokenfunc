package router

import (
	"net/http"
	"net/http/httptest"
	"regexp"
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

// macOS 自带 bash 3.2 与 bash 5 在 UTF-8 locale 下会把 $VAR 后紧跟的多字节字符（如全角逗号）并进变量名，
// 配合 set -u 直接报 unbound variable 退出；变量后接非 ASCII 字符必须写成 ${VAR}
func TestInstallShellScriptsBraceVariablesBeforeNonASCII(t *testing.T) {
	bareVarBeforeNonASCII := regexp.MustCompile(`\$[A-Za-z_][A-Za-z_0-9]*[^\x00-\x7F]`)
	entries, err := installScripts.ReadDir("install_scripts")
	require.NoError(t, err)
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".sh") {
			continue
		}
		data, err := installScripts.ReadFile("install_scripts/" + entry.Name())
		require.NoError(t, err)
		for i, line := range strings.Split(string(data), "\n") {
			assert.False(t, bareVarBeforeNonASCII.MatchString(line), "%s:%d 变量后紧跟非 ASCII 字符，改成 ${VAR}：%s", entry.Name(), i+1, line)
		}
	}
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
