package common

import (
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// 系统日志的 JSON 信封（TokenFunc 二开，schema 与 tokensolo 对齐，便于复用 CLS 查询）。
// 应用日志 logHelper、系统日志 SysLog/SysError、访问日志中间件、GORM / 标准库 log 收口
// 都经由 WriteJSONLog 输出，保证字段名与时间格式完全一致。

// LogServiceName 标记日志来源服务，CLS 跨服务区分用
const LogServiceName = "tokenfunc"

// LogTimeFormat RFC3339 带毫秒与时区，例如 2026-10-16T18:30:00.123+08:00；
// 时区取进程 TZ（容器统一 Asia/Shanghai），未设置时为 UTC
const LogTimeFormat = "2006-01-02T15:04:05.000Z07:00"

// logStackMaxLen panic 堆栈压成单行后的上限，CLS 单条可索引，不需要 multiline 采集
const logStackMaxLen = 8192

// LogEntry 统一的结构化日志条目
type LogEntry struct {
	Ts        string `json:"ts"`
	Level     string `json:"level"`
	Service   string `json:"service"`
	RequestID string `json:"request_id,omitempty"`
	Msg       string `json:"msg"`
	// Component 标记非业务代码的来源（gorm / stdlog），便于过滤
	Component string `json:"component,omitempty"`
	Stack     string `json:"stack,omitempty"`
	// 访问日志（type=access）专用
	Type string `json:"type,omitempty"`
	// Status 逻辑状态码，HTTPStatus 真实状态行；SSE 头已下发后流内出错的请求两者不同，
	// StreamErrorStatus 额外带出（relay 事件层接入后填充）
	Status            int     `json:"status,omitempty"`
	HTTPStatus        int     `json:"http_status,omitempty"`
	StreamErrorStatus int     `json:"stream_error_status,omitempty"`
	LatencyMs         float64 `json:"latency_ms,omitempty"`
	ClientIP          string  `json:"client_ip,omitempty"`
	Method            string  `json:"method,omitempty"`
	Path              string  `json:"path,omitempty"`
	RouteTag          string  `json:"route_tag,omitempty"`
	// 业务归因：access 日志带 user_id；relay 错误日志带 channel_id / model / upstream_status / error_reason
	UserID    int    `json:"user_id,omitempty"`
	ChannelID int    `json:"channel_id,omitempty"`
	Model     string `json:"model,omitempty"`
	// UpstreamStatus 用指针区分“未设置”与“上游无 HTTP 响应（0）”，网络级错误时 0 也要出现在日志里
	UpstreamStatus *int   `json:"upstream_status,omitempty"`
	ErrorReason    string `json:"error_reason,omitempty"`
}

// WriteJSONLog 把条目编码成单行 JSON 写入 writer，自动填 ts / service / level。
// 编码失败时降级为最小合法 JSON，保证日志不丢且仍是单行。
func WriteJSONLog(writer io.Writer, entry LogEntry) {
	entry.Ts = time.Now().Format(LogTimeFormat)
	entry.Service = LogServiceName
	if entry.Level == "" {
		entry.Level = "info"
	}
	data, err := Marshal(entry)
	if err != nil {
		_, _ = fmt.Fprintf(writer, "{\"ts\":%q,\"level\":%q,\"service\":%q,\"msg\":%q}\n", entry.Ts, entry.Level, LogServiceName, entry.Msg)
		return
	}
	// JSON 与换行一次 Write，避免并发请求在两次 Write 之间交错把 NDJSON 行写坏
	_, _ = writer.Write(append(data, '\n'))
}

// FlattenStack 把多行堆栈压成单行（换行转 " | "）并截到 8 KiB
func FlattenStack(stack string) string {
	flat := strings.ReplaceAll(stack, "\n", " | ")
	if len(flat) > logStackMaxLen {
		flat = flat[:logStackMaxLen] + "...(truncated)"
	}
	return flat
}

// dynamicLogWriter 每次写入时取当前的 gin writer，供 GORM / 标准库 log 这类
// 在启动时就要拿到 io.Writer 的组件使用；日志文件滚动换 writer 后它们也不会写到旧 fd。
// 调用方不得已持有 LogWriterMu，否则递归读锁在有写锁等待时会死锁。
type dynamicLogWriter struct {
	errorStream bool
}

func (w dynamicLogWriter) Write(p []byte) (int, error) {
	LogWriterMu.RLock()
	defer LogWriterMu.RUnlock()
	if w.errorStream {
		return gin.DefaultErrorWriter.Write(p)
	}
	return gin.DefaultWriter.Write(p)
}

func InfoLogWriter() io.Writer  { return dynamicLogWriter{} }
func ErrorLogWriter() io.Writer { return dynamicLogWriter{errorStream: true} }
