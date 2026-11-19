package middleware

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

func RelayPanicRecover() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				if common.LogFormatJSON {
					common.LogPanic(c.GetString(common.RequestIdKey), err, debug.Stack())
				} else {
					common.SysLog(common.LogText("panic detected: %v", err))
					common.SysLog(common.LogText("stacktrace from panic: %s", string(debug.Stack())))
				}
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": gin.H{
						"message": fmt.Sprintf("Panic detected, error: %v. Please submit a issue here: https://github.com/Calcium-Ion/new-api", err),
						"type":    "new_api_panic",
					},
				})
				c.Abort()
			}
		}()
		c.Next()
	}
}

// PanicRecover is the server-wide panic recovery. Gin logs the panic stack
// through common.ErrorLogWriter so it reaches the current log file.
func PanicRecover() gin.HandlerFunc {
	// TokenFunc 二开：json 模式下不让 gin 往 stderr 打多行堆栈，堆栈由 LogPanic 压成单行写进 stack 字段
	writer := common.ErrorLogWriter
	if common.LogFormatJSON {
		writer = nil
	}
	return gin.CustomRecoveryWithWriter(writer, func(c *gin.Context, err any) {
		if common.LogFormatJSON {
			common.LogPanic(c.GetString(common.RequestIdKey), err, debug.Stack())
		} else {
			common.SysLog(common.LogText("panic detected: %v", err))
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{
				"message": fmt.Sprintf("Panic detected, error: %v. Please submit a issue here: https://github.com/Calcium-Ion/new-api", err),
				"type":    "new_api_panic",
			},
		})
	})
}
