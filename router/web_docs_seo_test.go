package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const docsTestIndex = `<!doctype html>
<html lang="en">
  <head>
    <title>Acme</title>
    <meta name="title" content="Acme" />
    <meta
      name="description"
      content="default description"
    />
  </head>
  <body>
    <div id="root" translate="no" class="notranslate"></div>
  </body>
</html>`

func newDocsTestSEO(t *testing.T) *docsSEO {
	t.Helper()
	dist := fstest.MapFS{
		"docs-seo/manifest.json": {Data: []byte(`{
			"defaultLang": "zh",
			"defaultSlug": "quick-start",
			"langs": ["zh", "en"],
			"pages": [
				{"slug": "quick-start", "title": {"zh": "快速开始", "en": "Quick start"}, "description": {"zh": "三步接入", "en": "Three steps"}},
				{"slug": "faq", "title": {"zh": "常见问题", "en": "FAQ"}, "description": {"zh": "排错", "en": "Troubleshooting"}}
			]
		}`)},
		"docs-seo/zh/quick-start.html": {Data: []byte(`<article><h1>快速开始</h1><code>curl __TOKENFUNC_BASE_URL__/v1 $1</code><p>__TOKENFUNC_SITE_NAME__</p></article>`)},
		"docs-seo/en/quick-start.html": {Data: []byte(`<article><h1>Quick start</h1></article>`)},
		"docs-seo/zh/faq.html":         {Data: []byte(`<article><h1>常见问题</h1></article>`)},
		"docs-seo/en/faq.html":         {Data: []byte(`<article><h1>FAQ</h1></article>`)},
	}
	docs := newDocsSEO(dist)
	require.NotNil(t, docs)
	return docs
}

func withDocsSite(t *testing.T, address, name string) {
	t.Helper()
	origAddress, origName := system_setting.ServerAddress, common.SystemName
	t.Cleanup(func() { system_setting.ServerAddress, common.SystemName = origAddress, origName })
	system_setting.ServerAddress = address
	common.SystemName = name
}

func renderDocsPath(t *testing.T, docs *docsSEO, target string) (string, bool) {
	t.Helper()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, target, nil)
	out, ok := docs.render(c, []byte(docsTestIndex))
	return string(out), ok
}

func TestDocsSEORenderInjectsPrerenderedChinesePage(t *testing.T) {
	withDocsSite(t, "https://api.example.com/", `Acme & "Co"`)
	docs := newDocsTestSEO(t)

	out, ok := renderDocsPath(t, docs, "/docs/quick-start")
	require.True(t, ok)

	assert.Contains(t, out, `<html lang="zh-CN">`)
	assert.Contains(t, out, `<title>快速开始 - Acme &amp; &#34;Co&#34;</title>`)
	assert.Contains(t, out, `<meta name="description" content="三步接入" />`)
	assert.NotContains(t, out, "default description")
	assert.Contains(t, out, `<link rel="canonical" href="https://api.example.com/docs/quick-start" />`)
	assert.Contains(t, out, `<link rel="alternate" hreflang="en" href="https://api.example.com/docs/quick-start?lang=en" />`)
	assert.Contains(t, out, `<link rel="alternate" hreflang="x-default" href="https://api.example.com/docs/quick-start" />`)
	// 片段里的占位符按当前部署替换，$1 不被当成正则引用
	// 正文放在空的 #root 之后，前端入口仍能正常挂载
	assert.Contains(t, out, `<div id="root" translate="no" class="notranslate"></div><style>#root:not(:empty)+style+#docs-prerender{display:none}</style><div id="docs-prerender"><article><h1>快速开始</h1><code>curl https://api.example.com/v1 $1</code><p>Acme &amp; &#34;Co&#34;</p></article></div>`)
}

func TestDocsSEORenderSelectsEnglishAndDefaultPage(t *testing.T) {
	withDocsSite(t, "https://api.example.com", "Acme")
	docs := newDocsTestSEO(t)

	out, ok := renderDocsPath(t, docs, "/docs/faq?lang=en")
	require.True(t, ok)
	assert.Contains(t, out, `<html lang="en">`)
	assert.Contains(t, out, `<title>FAQ - Acme</title>`)
	assert.Contains(t, out, `<link rel="canonical" href="https://api.example.com/docs/faq?lang=en" />`)
	assert.Contains(t, out, `<h1>FAQ</h1>`)

	out, ok = renderDocsPath(t, docs, "/docs/")
	require.True(t, ok)
	assert.Contains(t, out, `<h1>快速开始</h1>`)

	// 不认识的语言回落到默认语言
	out, ok = renderDocsPath(t, docs, "/docs/faq?lang=fr")
	require.True(t, ok)
	assert.Contains(t, out, `<h1>常见问题</h1>`)
}

func TestDocsSEORenderIgnoresOtherPaths(t *testing.T) {
	withDocsSite(t, "https://api.example.com", "Acme")
	docs := newDocsTestSEO(t)

	for _, target := range []string{"/", "/pricing", "/docs/missing", "/docs/faq/extra", "/docsx"} {
		_, ok := renderDocsPath(t, docs, target)
		assert.False(t, ok, target)
	}

	var missing *docsSEO
	_, ok := missing.render(nil, []byte(docsTestIndex))
	assert.False(t, ok)
	assert.Nil(t, newDocsSEO(fstest.MapFS{}))
}

func TestDocsSEOSiteBaseURLFallsBackToRequestHost(t *testing.T) {
	withDocsSite(t, "http://localhost:3000", "Acme")
	docs := newDocsTestSEO(t)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/docs/faq", nil)
	c.Request.Host = "docs.acme.test"
	c.Request.Header.Set("X-Forwarded-Proto", "https")
	out, ok := docs.render(c, []byte(docsTestIndex))
	require.True(t, ok)
	assert.Contains(t, string(out), `<link rel="canonical" href="https://docs.acme.test/docs/faq" />`)
}

func TestDocsSEOSitemapAndRobots(t *testing.T) {
	withDocsSite(t, "https://api.example.com", "Acme")
	docs := newDocsTestSEO(t)
	engine := gin.New()
	registerDocsSEORoutes(engine, docs)

	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	body := rec.Body.String()
	assert.Contains(t, body, `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`)
	assert.Contains(t, body, `<loc>https://api.example.com/docs/faq</loc>`)
	assert.Contains(t, body, `<loc>https://api.example.com/docs/faq?lang=en</loc>`)
	assert.Contains(t, body, `<xhtml:link rel="alternate" hreflang="zh-CN" href="https://api.example.com/docs/faq"></xhtml:link>`)

	rec = httptest.NewRecorder()
	engine.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/robots.txt", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), "Disallow: /docs-seo/")
	assert.Contains(t, rec.Body.String(), "Sitemap: https://api.example.com/sitemap.xml")
}
