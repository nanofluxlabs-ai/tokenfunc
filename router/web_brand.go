package router

import (
	"bytes"
	"html"

	"github.com/QuantumNous/new-api/common"
)

// 构建期写入 web/index.html 的品牌占位值，运行时按后台配置替换
const (
	brandTitlePlaceholder = "<title>tokenfunc</title>"
	brandMetaPlaceholder  = `<meta name="title" content="tokenfunc" />`
	brandBodyPlaceholder  = "<body>"
)

// BrandIndexPage 在返回首页 HTML 前注入当前系统名与配色预设，
// 让标题栏首屏即为品牌名、首帧渲染即为品牌配色（避免 React 挂载前闪默认主题）。
func BrandIndexPage(base []byte) []byte {
	common.OptionMapRWMutex.RLock()
	name := common.SystemName
	preset := common.ThemePreset
	common.OptionMapRWMutex.RUnlock()

	page := base
	if name != "" {
		escaped := html.EscapeString(name)
		page = bytes.Replace(page, []byte(brandTitlePlaceholder), []byte("<title>"+escaped+"</title>"), 1)
		page = bytes.Replace(page, []byte(brandMetaPlaceholder), []byte(`<meta name="title" content="`+escaped+`" />`), 1)
	}
	if preset != "" && preset != "default" {
		page = bytes.Replace(page, []byte(brandBodyPlaceholder), []byte(`<body data-theme-preset="`+html.EscapeString(preset)+`">`), 1)
	}
	return page
}
