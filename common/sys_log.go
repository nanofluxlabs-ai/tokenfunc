package common

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// LogWriterMu protects concurrent access to gin.DefaultWriter/gin.DefaultErrorWriter
// during log file rotation. Acquire RLock when reading/writing through the writers,
// acquire Lock when swapping writers and closing old files.
var LogWriterMu sync.RWMutex

// 以下出口按 LogFormatJSON 分支：text 分支保持上游原有格式逐字节不变，json 分支走 WriteJSONLog

func SysLog(s string) {
	t := time.Now()
	LogWriterMu.RLock()
	defer LogWriterMu.RUnlock()
	if LogFormatJSON {
		WriteJSONLog(gin.DefaultWriter, LogEntry{Level: "info", Msg: s})
		return
	}
	_, _ = fmt.Fprintf(gin.DefaultWriter, "[SYS] %v | %s \n", t.Format("2006/01/02 - 15:04:05"), s)
}

// SysWarn 系统级告警（json 为 warn 级；text 仍用 [SYS] 前缀写 error writer）
func SysWarn(s string) {
	t := time.Now()
	LogWriterMu.RLock()
	defer LogWriterMu.RUnlock()
	if LogFormatJSON {
		WriteJSONLog(gin.DefaultErrorWriter, LogEntry{Level: "warn", Msg: s})
		return
	}
	_, _ = fmt.Fprintf(gin.DefaultErrorWriter, "[SYS] %v | %s \n", t.Format("2006/01/02 - 15:04:05"), s)
}

func SysError(s string) {
	t := time.Now()
	LogWriterMu.RLock()
	defer LogWriterMu.RUnlock()
	if LogFormatJSON {
		WriteJSONLog(gin.DefaultErrorWriter, LogEntry{Level: "error", Msg: s})
		return
	}
	_, _ = fmt.Fprintf(gin.DefaultErrorWriter, "[SYS] %v | %s \n", t.Format("2006/01/02 - 15:04:05"), s)
}

func FatalLog(v ...any) {
	t := time.Now()
	LogWriterMu.RLock()
	if LogFormatJSON {
		WriteJSONLog(gin.DefaultErrorWriter, LogEntry{Level: "fatal", Msg: fmt.Sprint(v...)})
	} else {
		_, _ = fmt.Fprintf(gin.DefaultErrorWriter, "[FATAL] %v | %v \n", t.Format("2006/01/02 - 15:04:05"), v)
	}
	LogWriterMu.RUnlock()
	os.Exit(1)
}

// LogPanic 以 error 级记录 panic，调用栈压成单行放进 stack 字段，CLS 按 level 告警不会漏报。
// text 模式只打一行提示，堆栈由 gin 自带的 Recovery 或调用方另行输出。
func LogPanic(requestID string, recovered any, stack []byte) {
	msg := fmt.Sprintf("panic detected: %v", recovered)
	if !LogFormatJSON {
		SysLog(msg)
		return
	}
	LogWriterMu.RLock()
	defer LogWriterMu.RUnlock()
	WriteJSONLog(gin.DefaultErrorWriter, LogEntry{
		Level:     "error",
		RequestID: requestID,
		Msg:       msg,
		Stack:     FlattenStack(string(stack)),
	})
}

func LogStartupSuccess(startTime time.Time, port string) {
	duration := time.Since(startTime)
	durationMs := duration.Milliseconds()

	if LogFormatJSON {
		// 容器 / CLS 场景不要 ANSI 横幅，一行可检索的启动记录即可
		if !SessionCookieSecure {
			SysWarn("Refresh cookie is not secure and refresh/logout Origin validation is disabled. Please set SESSION_COOKIE_SECURE=true in production.")
		}
		SysLog(fmt.Sprintf("%s %s ready in %d ms, listening on :%s", SystemName, Version, durationMs, port))
		return
	}

	// Get network IPs
	networkIps := GetNetworkIps()

	LogWriterMu.RLock()
	defer LogWriterMu.RUnlock()

	if SessionCookieSecure == false {
		// Warn when the local HTTP compatibility mode disables cookie transport
		// security and refresh/logout Origin validation.
		fmt.Fprintf(gin.DefaultWriter, "\n")
		fmt.Fprintf(gin.DefaultWriter, "  \033[33mWarning: Refresh cookie is not secure and refresh/logout Origin validation is disabled. Please set SESSION_COOKIE_SECURE=true in production.\033[0m\n")
		fmt.Fprintf(gin.DefaultWriter, "\n")
	}

	fmt.Fprintf(gin.DefaultWriter, "\n")
	fmt.Fprintf(gin.DefaultWriter, "  \033[32m%s %s\033[0m  ready in %d ms\n", SystemName, Version, durationMs)
	fmt.Fprintf(gin.DefaultWriter, "\n")

	if !IsRunningInContainer() {
		fmt.Fprintf(gin.DefaultWriter, "  ➜  \033[1mLocal:\033[0m   http://localhost:%s/\n", port)
	}

	for _, ip := range networkIps {
		fmt.Fprintf(gin.DefaultWriter, "  ➜  \033[1mNetwork:\033[0m http://%s:%s/\n", ip, port)
	}

	fmt.Fprintf(gin.DefaultWriter, "\n")
}
