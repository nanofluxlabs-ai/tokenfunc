package router

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
)

const brandTestIndex = `<html><head><title>tokenfunc</title><meta name="title" content="tokenfunc" /></head><body><div id="root"></div></body></html>`

func TestBrandIndexPageInjectsSystemNameAndPreset(t *testing.T) {
	origName, origPreset := common.SystemName, common.ThemePreset
	t.Cleanup(func() { common.SystemName, common.ThemePreset = origName, origPreset })

	common.SystemName = `Acme <AI> & "Co"`
	common.ThemePreset = "tokenfunc"

	out := string(BrandIndexPage([]byte(brandTestIndex)))
	assert.Contains(t, out, `<title>Acme &lt;AI&gt; &amp; &#34;Co&#34;</title>`)
	assert.Contains(t, out, `<meta name="title" content="Acme &lt;AI&gt; &amp; &#34;Co&#34;" />`)
	assert.Contains(t, out, `<body data-theme-preset="tokenfunc">`)
	assert.NotContains(t, out, "<body>")
}

func TestBrandIndexPageKeepsPlainBodyForDefaultPreset(t *testing.T) {
	origName, origPreset := common.SystemName, common.ThemePreset
	t.Cleanup(func() { common.SystemName, common.ThemePreset = origName, origPreset })

	common.SystemName = ""
	common.ThemePreset = "default"

	out := string(BrandIndexPage([]byte(brandTestIndex)))
	assert.Contains(t, out, "<title>tokenfunc</title>")
	assert.Contains(t, out, "<body>")
	assert.NotContains(t, out, "data-theme-preset")
}
