package router

// tokenfunc 二开：文档中心的搜索引擎优化。
// 构建期 web/scripts/tokenfunc-docs-prerender.ts 把每页正文预渲染成 HTML 片段放在 web/dist/docs-seo/，
// 这里在返回 /docs/* 时把片段注入首屏，并补齐标题、描述、规范地址与多语言链接；
// 同时动态生成 sitemap.xml 与 robots.txt。站点地址与站点名在请求时替换，白标部署无需重新构建。

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"html"
	"io/fs"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

const (
	docsSEODir                = "docs-seo"
	docsBaseURLPlaceholder    = "__TOKENFUNC_BASE_URL__"
	docsSiteNamePlaceholder   = "__TOKENFUNC_SITE_NAME__"
	defaultServerAddress      = "http://localhost:3000"
	docsSitemapXMLNamespace   = "http://www.sitemaps.org/schemas/sitemap/0.9"
	docsSitemapXHTMLNamespace = "http://www.w3.org/1999/xhtml"
	docsPrerenderStyle        = `<style>#root:not(:empty)+style+#docs-prerender{display:none}</style>`
)

var (
	docsTitlePattern       = regexp.MustCompile(`<title>[^<]*</title>`)
	docsMetaTitlePattern   = regexp.MustCompile(`<meta\s+name="title"\s+content="[^"]*"\s*/>`)
	docsMetaDescPattern    = regexp.MustCompile(`<meta\s+name="description"\s+content="[^"]*"\s*/>`)
	docsHTMLLangPattern    = regexp.MustCompile(`<html lang="[^"]*">`)
	docsRootElementPattern = regexp.MustCompile(`<div id="root"([^>]*)></div>`)
)

type docsManifestPage struct {
	Slug        string            `json:"slug"`
	Title       map[string]string `json:"title"`
	Description map[string]string `json:"description"`
}

type docsManifest struct {
	DefaultLang string             `json:"defaultLang"`
	DefaultSlug string             `json:"defaultSlug"`
	Langs       []string           `json:"langs"`
	Pages       []docsManifestPage `json:"pages"`
}

// docsSEO 持有预渲染产物；开发构建没有产物时为 nil，所有方法退化为不处理
type docsSEO struct {
	files    fs.FS
	manifest docsManifest
	pages    map[string]docsManifestPage
}

func newDocsSEO(dist fs.FS) *docsSEO {
	files, err := fs.Sub(dist, docsSEODir)
	if err != nil {
		return nil
	}
	raw, err := fs.ReadFile(files, "manifest.json")
	if err != nil {
		return nil
	}
	var manifest docsManifest
	if err := common.Unmarshal(raw, &manifest); err != nil || len(manifest.Pages) == 0 {
		common.SysLog(common.LogText("docs SEO manifest is invalid, prerendered docs are disabled"))
		return nil
	}
	pages := make(map[string]docsManifestPage, len(manifest.Pages))
	for _, page := range manifest.Pages {
		pages[page.Slug] = page
	}
	return &docsSEO{files: files, manifest: manifest, pages: pages}
}

// siteBaseURL 优先使用后台配置的服务地址；未配置时按当前请求推断
func siteBaseURL(c *gin.Context) string {
	address := strings.TrimRight(strings.TrimSpace(system_setting.ServerAddress), "/")
	if address != "" && address != defaultServerAddress {
		return address
	}
	scheme := strings.TrimSpace(strings.Split(c.Request.Header.Get("X-Forwarded-Proto"), ",")[0])
	if scheme != "https" && scheme != "http" {
		scheme = "http"
		if c.Request.TLS != nil {
			scheme = "https"
		}
	}
	return scheme + "://" + c.Request.Host
}

func docsSiteName() string {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	if common.SystemName != "" {
		return common.SystemName
	}
	return "tokenfunc"
}

func (d *docsSEO) pageURL(base, slug, lang string) string {
	if lang == d.manifest.DefaultLang {
		return fmt.Sprintf("%s/docs/%s", base, slug)
	}
	return fmt.Sprintf("%s/docs/%s?lang=%s", base, slug, url.QueryEscape(lang))
}

func docsHrefLang(lang string) string {
	if lang == "zh" {
		return "zh-CN"
	}
	return lang
}

// resolve 把请求路径解析成文档页与语言；不是文档页时返回 false
func (d *docsSEO) resolve(c *gin.Context) (docsManifestPage, string, bool) {
	path := strings.TrimRight(c.Request.URL.Path, "/")
	slug := d.manifest.DefaultSlug
	if path != "/docs" {
		rest, ok := strings.CutPrefix(path, "/docs/")
		if !ok || rest == "" || strings.Contains(rest, "/") {
			return docsManifestPage{}, "", false
		}
		slug = rest
	}
	page, ok := d.pages[slug]
	if !ok {
		return docsManifestPage{}, "", false
	}
	lang := d.manifest.DefaultLang
	if requested := c.Query("lang"); requested != "" && slices.Contains(d.manifest.Langs, requested) {
		lang = requested
	}
	return page, lang, true
}

// render 在已注入品牌的首页 HTML 上叠加文档页内容；不是文档页时原样返回 false
func (d *docsSEO) render(c *gin.Context, indexPage []byte) ([]byte, bool) {
	if d == nil {
		return nil, false
	}
	page, lang, ok := d.resolve(c)
	if !ok {
		return nil, false
	}
	fragment, err := fs.ReadFile(d.files, lang+"/"+page.Slug+".html")
	if err != nil {
		return nil, false
	}

	base := siteBaseURL(c)
	siteName := docsSiteName()
	title := html.EscapeString(page.Title[lang] + " - " + siteName)
	description := html.EscapeString(page.Description[lang])
	canonical := html.EscapeString(d.pageURL(base, page.Slug, lang))

	var head strings.Builder
	fmt.Fprintf(&head, `<link rel="canonical" href="%s" />`, canonical)
	for _, alt := range d.manifest.Langs {
		fmt.Fprintf(&head, `<link rel="alternate" hreflang="%s" href="%s" />`,
			docsHrefLang(alt), html.EscapeString(d.pageURL(base, page.Slug, alt)))
	}
	fmt.Fprintf(&head, `<link rel="alternate" hreflang="x-default" href="%s" />`,
		html.EscapeString(d.pageURL(base, page.Slug, d.manifest.DefaultLang)))
	fmt.Fprintf(&head, `<meta property="og:type" content="article" /><meta property="og:title" content="%s" /><meta property="og:description" content="%s" /><meta property="og:url" content="%s" /><meta property="og:site_name" content="%s" />`,
		title, description, canonical, html.EscapeString(siteName))
	head.WriteString("</head>")

	body := bytes.ReplaceAll(fragment, []byte(docsBaseURLPlaceholder), []byte(html.EscapeString(base)))
	body = bytes.ReplaceAll(body, []byte(docsSiteNamePlaceholder), []byte(html.EscapeString(siteName)))

	out := docsHTMLLangPattern.ReplaceAll(indexPage, []byte(`<html lang="`+docsHrefLang(lang)+`">`))
	out = docsTitlePattern.ReplaceAll(out, []byte("<title>"+title+"</title>"))
	out = docsMetaTitlePattern.ReplaceAll(out, []byte(`<meta name="title" content="`+title+`" />`))
	out = docsMetaDescPattern.ReplaceAll(out, []byte(`<meta name="description" content="`+description+`" />`))
	out = bytes.Replace(out, []byte("</head>"), []byte(head.String()), 1)
	// 前端入口只在 #root 为空时挂载，所以正文放在 #root 之后的兄弟节点里；
	// 应用挂载后 #root 非空，内联样式即把静态正文隐藏。ReplaceAllFunc 避免片段里的 $ 被当成正则引用
	out = docsRootElementPattern.ReplaceAllFunc(out, func(match []byte) []byte {
		page := append([]byte{}, match...)
		page = append(page, docsPrerenderStyle...)
		page = append(page, `<div id="docs-prerender">`...)
		page = append(page, body...)
		return append(page, "</div>"...)
	})
	return out, true
}

type docsSitemapLink struct {
	Rel      string `xml:"rel,attr"`
	HrefLang string `xml:"hreflang,attr"`
	Href     string `xml:"href,attr"`
}

type docsSitemapURL struct {
	Loc   string            `xml:"loc"`
	Links []docsSitemapLink `xml:"xhtml:link"`
}

type docsSitemap struct {
	XMLName xml.Name         `xml:"urlset"`
	XMLNS   string           `xml:"xmlns,attr"`
	XHTML   string           `xml:"xmlns:xhtml,attr"`
	URLs    []docsSitemapURL `xml:"url"`
}

func (d *docsSEO) sitemap(c *gin.Context) {
	base := siteBaseURL(c)
	doc := docsSitemap{XMLNS: docsSitemapXMLNamespace, XHTML: docsSitemapXHTMLNamespace}
	doc.URLs = append(doc.URLs, docsSitemapURL{Loc: base + "/"})
	for _, page := range d.manifest.Pages {
		links := make([]docsSitemapLink, 0, len(d.manifest.Langs))
		for _, lang := range d.manifest.Langs {
			links = append(links, docsSitemapLink{Rel: "alternate", HrefLang: docsHrefLang(lang), Href: d.pageURL(base, page.Slug, lang)})
		}
		for _, lang := range d.manifest.Langs {
			doc.URLs = append(doc.URLs, docsSitemapURL{Loc: d.pageURL(base, page.Slug, lang), Links: links})
		}
	}
	out, err := xml.Marshal(doc)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(http.StatusOK, "application/xml; charset=utf-8", append([]byte(xml.Header), out...))
}

func (d *docsSEO) robots(c *gin.Context) {
	body := fmt.Sprintf("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /v1/\nDisallow: /%s/\n\nSitemap: %s/sitemap.xml\n", docsSEODir, siteBaseURL(c))
	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(body))
}

// registerDocsSEORoutes 只有存在预渲染产物时才接管 sitemap 与 robots
func registerDocsSEORoutes(router *gin.Engine, docs *docsSEO) {
	if docs == nil {
		return
	}
	router.GET("/sitemap.xml", docs.sitemap)
	router.GET("/robots.txt", docs.robots)
}
