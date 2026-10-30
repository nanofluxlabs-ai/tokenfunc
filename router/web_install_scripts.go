package router

// tokenfunc 二开：三方工具一键配置脚本（文档「Claude Code」「Codex」页引用）。
// GET /install/<工具>.sh  → macOS / Linux：curl -fsSL <站点>/install/claude-code.sh | bash
// GET /install/<工具>.ps1 → Windows：irm <站点>/install/claude-code.ps1 | iex
// 脚本由公共部分与工具部分拼接，并填入站点地址与名称；密钥由脚本运行时交互输入，不经过本接口。

import (
	"embed"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

//go:embed install_scripts/*.sh install_scripts/*.ps1
var installScripts embed.FS

const (
	installBaseURLPlaceholder  = "__TF_BASE_URL__"
	installSiteNamePlaceholder = "__TF_SITE_NAME__"
)

// installTools 支持一键配置的工具（与 install_scripts 下的文件名一致）
var installTools = map[string]bool{"claude-code": true, "codex": true}

// 站点地址会写进 shell / PowerShell 字符串，只接受普通 URL 字符，避免注入
var installBaseURLPattern = regexp.MustCompile(`^https?://[A-Za-z0-9.\-]+(:[0-9]+)?(/[A-Za-z0-9._~\-/]*)?$`)

// 站点名称只保留字母、数字、空格与少量符号，去掉引号、$、反引号等在脚本里有特殊含义的字符
var installSiteNameUnsafe = regexp.MustCompile(`[^\p{L}\p{N} ._\-]`)

func registerInstallScriptRoutes(router *gin.Engine) {
	router.GET("/install/:script", serveInstallScript)
}

// renderInstallScript 拼接并填充脚本；script 形如 claude-code.sh，未知工具或扩展名返回 false
func renderInstallScript(script, baseURL, siteName string) (string, bool) {
	tool, ext, found := strings.Cut(script, ".")
	if !found || !installTools[tool] || (ext != "sh" && ext != "ps1") {
		return "", false
	}
	common, err := installScripts.ReadFile("install_scripts/common." + ext)
	if err != nil {
		return "", false
	}
	body, err := installScripts.ReadFile("install_scripts/" + script)
	if err != nil {
		return "", false
	}
	text := string(common) + string(body)
	if ext == "ps1" {
		// 包在脚本块里执行：iex 运行在用户自己的会话中，避免辅助函数与变量残留
		text = "& {\n" + text + "\n}\n"
	}
	name := strings.TrimSpace(installSiteNameUnsafe.ReplaceAllString(siteName, ""))
	if name == "" {
		name = "tokenfunc"
	}
	text = strings.ReplaceAll(text, installBaseURLPlaceholder, baseURL)
	text = strings.ReplaceAll(text, installSiteNamePlaceholder, name)
	return text, true
}

func serveInstallScript(c *gin.Context) {
	baseURL := strings.TrimRight(siteBaseURL(c), "/")
	if !installBaseURLPattern.MatchString(baseURL) {
		c.String(http.StatusServiceUnavailable, "site address is not configured correctly\n")
		return
	}
	text, ok := renderInstallScript(c.Param("script"), baseURL, docsSiteName())
	if !ok {
		c.String(http.StatusNotFound, "not found\n")
		return
	}
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(text))
}
