package controller

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newSiteAssetTestRouter(t *testing.T, store *financeMemoryStore) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	var restore func()
	if store == nil {
		restore = service.SetLogArchiveStoreForTest(nil)
	} else {
		restore = service.SetLogArchiveStoreForTest(store)
	}
	t.Cleanup(restore)
	router := gin.New()
	// 鉴权（RootAuth）在路由层，这里只测上传与读取本身
	router.POST("/api/site-assets", UploadSiteAsset)
	router.GET("/api/site-assets/:kind/:name", GetSiteAsset)
	return router
}

func siteAssetUpload(t *testing.T, router http.Handler, kind string, filename string, content []byte) map[string]any {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	require.NoError(t, writer.WriteField("kind", kind))
	part, err := writer.CreateFormFile("file", filename)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	request := httptest.NewRequest(http.MethodPost, "/api/site-assets", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var parsed map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &parsed))
	return parsed
}

func testImage(t *testing.T, format string) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(1, 1, color.Black)
	var buf bytes.Buffer
	if format == "jpeg" {
		require.NoError(t, jpeg.Encode(&buf, img, nil))
	} else {
		require.NoError(t, png.Encode(&buf, img))
	}
	return buf.Bytes()
}

func TestSiteAssetUploadAndServe(t *testing.T) {
	store := &financeMemoryStore{objects: map[string][]byte{}}
	router := newSiteAssetTestRouter(t, store)

	pngBytes := testImage(t, "png")
	result := siteAssetUpload(t, router, "sales-qrcode", "qr.png", pngBytes)
	require.Equal(t, true, result["success"], result)
	url := result["data"].(map[string]any)["url"].(string)
	assert.Regexp(t, `^/api/site-assets/sales-qrcode/[0-9a-f]{16}\.png$`, url)

	// 同一内容重复上传得到同一地址（按内容寻址，不覆盖其他图）
	again := siteAssetUpload(t, router, "sales-qrcode", "renamed.png", pngBytes)
	assert.Equal(t, url, again["data"].(map[string]any)["url"])
	assert.Len(t, store.objects, 1)

	// 扩展名以嗅探出的真实类型为准，与文件名无关
	jpegResult := siteAssetUpload(t, router, "sales-qrcode", "qr.png", testImage(t, "jpeg"))
	assert.True(t, strings.HasSuffix(jpegResult["data"].(map[string]any)["url"].(string), ".jpg"))

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, url, nil))
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, pngBytes, recorder.Body.Bytes())
	assert.Equal(t, "image/png", recorder.Header().Get("Content-Type"))
	assert.Equal(t, "public, max-age=31536000, immutable", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
}

func TestSiteAssetUploadRejectsUnsafeInput(t *testing.T) {
	store := &financeMemoryStore{objects: map[string][]byte{}}
	router := newSiteAssetTestRouter(t, store)
	svg := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
	oversized := append(testImage(t, "png"), bytes.Repeat([]byte{0}, siteAssetMaxBytes)...)

	cases := []struct {
		name     string
		kind     string
		filename string
		content  []byte
	}{
		{"svg", "sales-qrcode", "qr.svg", svg},
		{"text disguised as png", "sales-qrcode", "qr.png", []byte("not an image at all")},
		{"oversized", "sales-qrcode", "big.png", oversized},
		{"unknown kind", "logo", "qr.png", testImage(t, "png")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			result := siteAssetUpload(t, router, c.kind, c.filename, c.content)
			assert.Equal(t, false, result["success"], result)
		})
	}
	assert.Empty(t, store.objects)
}

func TestSiteAssetServeValidatesPathAndStore(t *testing.T) {
	router := newSiteAssetTestRouter(t, &financeMemoryStore{objects: map[string][]byte{}})
	for _, path := range []string{
		"/api/site-assets/sales-qrcode/0123456789abcdef.png", // 合法但不存在
		"/api/site-assets/sales-qrcode/..%2F..%2Flogs.csv.gz",
		"/api/site-assets/logs/0123456789abcdef.png",
		"/api/site-assets/sales-qrcode/0123456789abcdef.svg",
	} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		assert.Equal(t, http.StatusNotFound, recorder.Code, path)
	}

	disabled := newSiteAssetTestRouter(t, nil)
	recorder := httptest.NewRecorder()
	disabled.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/site-assets/sales-qrcode/0123456789abcdef.png", nil))
	assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	result := siteAssetUpload(t, disabled, "sales-qrcode", "qr.png", testImage(t, "png"))
	assert.Equal(t, false, result["success"])
	assert.Contains(t, result["message"], "Object storage is not configured")
}
