package controller

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"regexp"
	"slices"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// 站点素材（TokenFunc 二开）：管理员在后台上传的公开图片（目前只有商务微信二维码），
// 存在日志归档所用的同一个 COS 桶根目录的 site-assets/ 下（不跟随归档前缀，便于只对这一目录开公有读）。
// 配置了 SITE_ASSET_PUBLIC_BASE_URL（如 https://files.tokenfunc.com）时返回 COS 直链；
// 未配置时访客经 GET /api/site-assets/:kind/:name 由本站转发读取。对象名按内容寻址，可以永久缓存。

const (
	siteAssetMaxBytes     = 2 << 20
	siteAssetDir          = "site-assets"
	siteAssetCacheEntries = 32
)

// siteAssetKinds 允许上传的素材类别（目录名）
var siteAssetKinds = []string{"sales-qrcode"}

// siteAssetTypes 嗅探出的真实类型 → 扩展名；SVG 能内嵌脚本，一律不收
var siteAssetTypes = map[string]string{
	"image/png":  "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
}

var siteAssetNamePattern = regexp.MustCompile(`^[0-9a-f]{16}\.(png|jpg|webp)$`)

type siteAssetObject struct {
	body        []byte
	contentType string
}

// siteAssetCache 进程内缓存最近读取的素材，避免每次访问都回源 COS；对象内容不可变，无需失效
var siteAssetCache = struct {
	sync.Mutex
	items map[string]siteAssetObject
	order []string
}{items: map[string]siteAssetObject{}}

func siteAssetCacheGet(key string) (siteAssetObject, bool) {
	siteAssetCache.Lock()
	defer siteAssetCache.Unlock()
	object, ok := siteAssetCache.items[key]
	return object, ok
}

func siteAssetCachePut(key string, object siteAssetObject) {
	siteAssetCache.Lock()
	defer siteAssetCache.Unlock()
	if _, ok := siteAssetCache.items[key]; ok {
		return
	}
	if len(siteAssetCache.order) >= siteAssetCacheEntries {
		oldest := siteAssetCache.order[0]
		siteAssetCache.order = siteAssetCache.order[1:]
		delete(siteAssetCache.items, oldest)
	}
	siteAssetCache.items[key] = object
	siteAssetCache.order = append(siteAssetCache.order, key)
}

// UploadSiteAsset POST /api/site-assets：multipart 字段 file + kind，返回站内访问地址
func UploadSiteAsset(c *gin.Context) {
	kind := c.PostForm("kind")
	if !slices.Contains(siteAssetKinds, kind) {
		common.ApiErrorT(c, "Unsupported asset type")
		return
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorT(c, "Please choose an image to upload")
		return
	}
	if fileHeader.Size > siteAssetMaxBytes {
		common.ApiErrorT(c, "Only PNG, JPEG or WebP images up to 2 MB are supported")
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer file.Close()
	// 多读 1 字节判断是否超限，不信任客户端声明的大小
	body, err := io.ReadAll(io.LimitReader(file, siteAssetMaxBytes+1))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	contentType := http.DetectContentType(body)
	ext, ok := siteAssetTypes[contentType]
	if len(body) == 0 || len(body) > siteAssetMaxBytes || !ok {
		common.ApiErrorT(c, "Only PNG, JPEG or WebP images up to 2 MB are supported")
		return
	}

	store, err := service.LogArchiveStore()
	if errors.Is(err, service.ErrLogArchiveStoreDisabled) {
		common.ApiErrorT(c, "Object storage is not configured. Enter an image URL instead.")
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	sum := sha256.Sum256(body)
	name := hex.EncodeToString(sum[:])[:16] + "." + ext
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	if _, err := store.Put(ctx, siteAssetObjectKey(kind, name), bytes.NewReader(body), int64(len(body)), contentType, nil); err != nil {
		common.SysError(common.LogText("site asset upload failed: %s", err.Error()))
		common.ApiErrorT(c, "Upload failed, please try again later")
		return
	}
	common.ApiSuccess(c, gin.H{"url": siteAssetURL(kind, name)})
}

// siteAssetObjectKey 桶内 key：固定在根目录 site-assets/ 下，与日志归档前缀无关
func siteAssetObjectKey(kind string, name string) string {
	return siteAssetDir + "/" + kind + "/" + name
}

// siteAssetURL 访问地址：配置了公开域名用 COS 直链，否则走本站转发
func siteAssetURL(kind string, name string) string {
	if common.SiteAssetPublicBaseURL != "" {
		return common.SiteAssetPublicBaseURL + "/" + siteAssetObjectKey(kind, name)
	}
	return "/api/" + siteAssetObjectKey(kind, name)
}

// GetSiteAsset GET /api/site-assets/:kind/:name：公开读取站点素材，参数严格校验，杜绝读取桶内其他对象
func GetSiteAsset(c *gin.Context) {
	kind, name := c.Param("kind"), c.Param("name")
	if !slices.Contains(siteAssetKinds, kind) || !siteAssetNamePattern.MatchString(name) {
		c.Status(http.StatusNotFound)
		return
	}
	store, err := service.LogArchiveStore()
	if err != nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	key := siteAssetObjectKey(kind, name)
	object, ok := siteAssetCacheGet(key)
	if !ok {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()
		reader, err := store.Get(ctx, key)
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		body, err := io.ReadAll(io.LimitReader(reader, siteAssetMaxBytes+1))
		_ = reader.Close()
		if err != nil || len(body) > siteAssetMaxBytes {
			c.Status(http.StatusNotFound)
			return
		}
		contentType := http.DetectContentType(body)
		if _, allowed := siteAssetTypes[contentType]; !allowed {
			c.Status(http.StatusNotFound)
			return
		}
		object = siteAssetObject{body: body, contentType: contentType}
		siteAssetCachePut(key, object)
	}
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, object.contentType, object.body)
}
