package middleware

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

const RouteTagKey = "route_tag"

func RouteTag(tag string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(RouteTagKey, tag)
		c.Next()
	}
}

// SetUpLogger 注册 HTTP 访问日志中间件。
// 不再用 gin.LoggerWithFormatter：它在注册时就捕获了 gin.DefaultWriter，日志文件滚动换 writer 后
// 访问日志仍写旧 fd。这里每次写入时取当前 writer；text 模式输出与原 [GIN] 格式逐字节一致，
// json 模式输出 type=access 的结构化条目。
func SetUpLogger(server *gin.Engine) {
	server.Use(redactTaskArtifactAccessQuery())
	server.Use(func(c *gin.Context) {
		start := time.Now()
		// 与 gin 原 logger 一致：进入时取 path / query（此时任务产物的 access 参数已被上一中间件摘掉）
		path := c.Request.URL.Path
		escapedPath := c.Request.URL.EscapedPath()
		raw := c.Request.URL.RawQuery

		c.Next()

		end := time.Now()
		latency := end.Sub(start)
		if raw != "" {
			path = path + "?" + raw
		}
		// OAuth callbacks carry one-time codes and state in the query string.
		// Redact the log value only; the handler still needs the original query.
		if strings.HasPrefix(path, "/api/oauth/") || strings.HasPrefix(path, "/oauth/") {
			path, _, _ = strings.Cut(path, "?")
		} else if raw != "" {
			// 上游 #7972：query 里的 key / token 等凭据脱敏后再记录（text / json 两种格式共用）
			query, _ := url.ParseQuery(raw)
			path = escapedPath + relaycommon.SanitizeURLForLog("?"+query.Encode())
		}
		// 用 c.GetString 读 Keys（带锁），避免与 handler 内后台 goroutine 并发写产生 data race
		requestID := c.GetString(common.RequestIdKey)
		tag := c.GetString(RouteTagKey)
		if tag == "" {
			tag = "web"
		}
		status := c.Writer.Status()
		clientIP := c.ClientIP()
		method := c.Request.Method

		common.LogWriterMu.RLock()
		defer common.LogWriterMu.RUnlock()
		if !common.LogFormatJSON {
			if latency > time.Minute {
				latency = latency.Truncate(time.Second)
			}
			_, _ = fmt.Fprintf(gin.DefaultWriter, "[GIN] %s | %s | %s | %3d | %13v | %15s | %7s %s\n",
				end.Format("2006/01/02 - 15:04:05"), tag, requestID, status, latency, clientIP, method, path)
			return
		}
		level := "info"
		switch {
		case status >= 500:
			level = "error"
		case status >= 400:
			level = "warn"
		}
		common.WriteJSONLog(gin.DefaultWriter, common.LogEntry{
			Level:      level,
			RequestID:  requestID,
			Type:       "access",
			Status:     status,
			HTTPStatus: status,
			LatencyMs:  float64(latency.Microseconds()) / 1000.0,
			ClientIP:   clientIP,
			Method:     method,
			Path:       path,
			RouteTag:   tag,
			Msg:        method + " " + path,
			UserID:     c.GetInt("id"),
		})
	})
}
