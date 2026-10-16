package logger

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"gopkg.in/natefinch/lumberjack.v2"
)

const (
	loggerINFO  = "INFO"
	loggerWarn  = "WARN"
	loggerError = "ERR"
	loggerDebug = "DEBUG"
)

// 文件日志用 lumberjack 按大小 / 天数滚动（TokenFunc 二开，替代上游按行数换文件）。
// 活动文件固定为 <LogDir>/tokenfunc.log，滚动备份为 tokenfunc-<时间戳>.log。
var rotatingLogger *lumberjack.Logger
var rotatingLoggerMu sync.Mutex

func GetCurrentLogPath() string {
	rotatingLoggerMu.Lock()
	defer rotatingLoggerMu.Unlock()
	if rotatingLogger == nil {
		return ""
	}
	return rotatingLogger.Filename
}

func SetupLogger() {
	if *common.LogDir != "" {
		rotatingLoggerMu.Lock()
		if rotatingLogger != nil {
			_ = rotatingLogger.Close()
		}
		rotatingLogger = &lumberjack.Logger{
			Filename:   filepath.Join(*common.LogDir, "tokenfunc.log"),
			MaxSize:    common.LogMaxSizeMB,
			MaxBackups: common.LogMaxBackups,
			MaxAge:     common.LogRetentionDays,
			LocalTime:  true,
		}
		rotatingLoggerMu.Unlock()

		common.LogWriterMu.Lock()
		gin.DefaultWriter = io.MultiWriter(os.Stdout, rotatingLogger)
		gin.DefaultErrorWriter = io.MultiWriter(os.Stderr, rotatingLogger)
		common.LogWriterMu.Unlock()
	}
	if common.LogFormatJSON {
		// 标准库 log 的零散调用点收口成 JSON，json 模式下 stderr 不得出现非 JSON 行
		log.SetFlags(0)
		log.SetOutput(stdlogJSONWriter{})
	}
}

// stdlogJSONWriter 把标准库 log 的每次写入包成一条 warn 级 JSON
type stdlogJSONWriter struct{}

func (stdlogJSONWriter) Write(p []byte) (int, error) {
	common.WriteJSONLog(common.ErrorLogWriter(), common.LogEntry{
		Level:     "warn",
		Component: "stdlog",
		Msg:       strings.TrimSpace(string(p)),
	})
	return len(p), nil
}

func LogInfo(ctx context.Context, msg string) {
	logHelper(ctx, loggerINFO, msg)
}

func LogWarn(ctx context.Context, msg string, args ...any) {
	if len(args) > 0 {
		msg = fmt.Sprintf(msg, args...)
	}
	logHelper(ctx, loggerWarn, msg)
}

func LogError(ctx context.Context, msg string) {
	logHelper(ctx, loggerError, msg)
}

// LogDebug formats msg with common.LogText only when debug logging is on, so
// callers pass the format and its arguments instead of a formatted string.
func LogDebug(ctx context.Context, msg string, args ...any) {
	if common.DebugEnabled {
		logHelper(ctx, loggerDebug, common.LogText(msg, args...))
	}
}

func logHelper(ctx context.Context, level string, msg string) {
	if common.LogFormatJSON {
		logHelperWith(ctx, level, msg, nil)
		return
	}
	var id any = "SYSTEM"
	if ctx != nil {
		if requestID := ctx.Value(common.RequestIdKey); requestID != nil {
			id = requestID
		}
	}
	now := time.Now()
	common.LogWriterMu.RLock()
	writer := gin.DefaultErrorWriter
	if level == loggerINFO {
		writer = gin.DefaultWriter
	}
	_, _ = fmt.Fprintf(writer, "[%s] %v | %s | %s \n", level, now.Format("2006/01/02 - 15:04:05"), id, msg)
	common.LogWriterMu.RUnlock()
}

// logHelperWith JSON 出口，decorate 可注入额外结构化字段（如 relay 错误的 channel_id / model）
func logHelperWith(ctx context.Context, level string, msg string, decorate func(*common.LogEntry)) {
	entry := common.LogEntry{
		Level:     normalizeLogLevel(level),
		RequestID: requestIDFrom(ctx),
		Msg:       msg,
	}
	if decorate != nil {
		decorate(&entry)
	}
	common.LogWriterMu.RLock()
	writer := gin.DefaultErrorWriter
	if level == loggerINFO {
		writer = gin.DefaultWriter
	}
	common.WriteJSONLog(writer, entry)
	common.LogWriterMu.RUnlock()
}

func requestIDFrom(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if id := ctx.Value(common.RequestIdKey); id != nil {
		return fmt.Sprintf("%v", id)
	}
	return ""
}

// LogRelayError 记录 relay 失败并把渠道 / 模型 / 上游状态 / 错误分类拎成结构化字段，
// 便于 CLS 按 channel_id / model 维度排查；text 模式把这些字段拼进文本。
func LogRelayError(ctx context.Context, channelID int, model string, upstreamStatus int, reason string, msg string) {
	if !common.LogFormatJSON {
		logHelper(ctx, loggerError, fmt.Sprintf("%s (channel_id=%d model=%s upstream_status=%d error_reason=%s)", msg, channelID, model, upstreamStatus, reason))
		return
	}
	logHelperWith(ctx, loggerError, msg, func(e *common.LogEntry) {
		e.ChannelID = channelID
		e.Model = model
		// 始终记录上游状态码，包括 0（网络级错误、无 HTTP 响应），指针避免 omitempty 吞掉 0
		e.UpstreamStatus = &upstreamStatus
		e.ErrorReason = reason
	})
}

// normalizeLogLevel 内部 level 常量映射为统一小写级别
func normalizeLogLevel(level string) string {
	switch level {
	case loggerINFO:
		return "info"
	case loggerWarn:
		return "warn"
	case loggerError:
		return "error"
	case loggerDebug:
		return "debug"
	default:
		return strings.ToLower(level)
	}
}

// LogEvent 输出单行结构化事件日志，自动注入 event / ts / level / service / msg / request_id，
// 配合 events.go 的 Event* / Field* 常量使用。
func LogEvent(ctx context.Context, event string, fields map[string]any) {
	logEventInternal(ctx, event, "info", nil, fields)
}

// LogEventErr 带错误信息的事件日志，level 固定 error，err 文本脱敏并截到 1 KiB 后放进 error_message
func LogEventErr(ctx context.Context, event string, err error, fields map[string]any) {
	logEventInternal(ctx, event, "error", err, fields)
}

func logEventInternal(ctx context.Context, event, level string, err error, fields map[string]any) {
	// 日志构建过程中的任何 panic 都不允许影响主业务流
	defer func() {
		if r := recover(); r != nil {
			common.SysError(fmt.Sprintf("LogEvent recovered from panic event=%s level=%s panic=%v", event, level, r))
		}
	}()
	if fields == nil {
		fields = make(map[string]any, 8)
	}
	if err != nil {
		msg := common.MaskSensitiveInfo(err.Error())
		const maxErrMsgLen = 1024
		if len(msg) > maxErrMsgLen {
			msg = msg[:maxErrMsgLen] + "...(truncated)"
		}
		fields[FieldErrorMessage] = msg
	}
	// 与信封层同名同格式，CLS 上 event 日志与普通日志共用 ts / level / service 索引
	fields["event"] = event
	fields["level"] = level
	fields["service"] = common.LogServiceName
	fields["msg"] = event
	fields["ts"] = time.Now().Format(common.LogTimeFormat)
	if rid := requestIDFrom(ctx); rid != "" {
		if _, exists := fields[FieldRequestID]; !exists {
			fields[FieldRequestID] = rid
		}
	}
	data, mErr := common.Marshal(fields)
	if mErr != nil {
		common.SysError(fmt.Sprintf("LogEvent marshal failed event=%s err=%v", event, mErr))
		return
	}
	if !common.LogFormatJSON {
		textLevel := loggerINFO
		if level == "error" {
			textLevel = loggerError
		}
		logHelper(ctx, textLevel, "event="+event+" "+string(data))
		return
	}
	common.LogWriterMu.RLock()
	writer := gin.DefaultErrorWriter
	if level == "info" {
		writer = gin.DefaultWriter
	}
	_, _ = writer.Write(append(data, '\n'))
	common.LogWriterMu.RUnlock()
}

// LogQuota formats a quota for a server log line.
func LogQuota(quota int) string {
	// 新逻辑：根据额度展示类型输出
	q := float64(quota)
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		usd := q / common.QuotaPerUnit
		cny := usd * operation_setting.USDExchangeRate
		return common.LogText("¥%.6f quota", cny)
	case operation_setting.QuotaDisplayTypeCustom:
		usd := q / common.QuotaPerUnit
		rate := operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate
		symbol := operation_setting.GetGeneralSetting().CustomCurrencySymbol
		if symbol == "" {
			symbol = "¤"
		}
		if rate <= 0 {
			rate = 1
		}
		v := usd * rate
		return common.LogText("%s%.6f quota", symbol, v)
	case operation_setting.QuotaDisplayTypeTokens:
		return common.LogText("%d quota points", quota)
	default: // USD
		return common.LogText("＄%.6f quota", q/common.QuotaPerUnit)
	}
}

func FormatQuota(quota int) string {
	q := float64(quota)
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		usd := q / common.QuotaPerUnit
		cny := usd * operation_setting.USDExchangeRate
		return fmt.Sprintf("¥%.6f", cny)
	case operation_setting.QuotaDisplayTypeCustom:
		usd := q / common.QuotaPerUnit
		rate := operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate
		symbol := operation_setting.GetGeneralSetting().CustomCurrencySymbol
		if symbol == "" {
			symbol = "¤"
		}
		if rate <= 0 {
			rate = 1
		}
		v := usd * rate
		return fmt.Sprintf("%s%.6f", symbol, v)
	case operation_setting.QuotaDisplayTypeTokens:
		return fmt.Sprintf("%d", quota)
	default:
		return fmt.Sprintf("＄%.6f", q/common.QuotaPerUnit)
	}
}

// LogJson 仅供测试使用 only for test
func LogJson(ctx context.Context, msg string, obj any) {
	if !common.DebugEnabled {
		return
	}
	jsonStr, err := common.Marshal(obj)
	if err != nil {
		LogError(ctx, common.LogText("json marshal failed: %s", err.Error()))
		return
	}
	LogDebug(ctx, "%s | %s", msg, jsonStr)
}
