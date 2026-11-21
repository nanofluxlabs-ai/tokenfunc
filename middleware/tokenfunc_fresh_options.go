package middleware

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// FreshOptions 进 handler 前把本副本的 option 内存从数据库重载一遍（与节点同步任务调用的是同一个函数）。
// 多副本下管理员刚保存的 option 由另一个副本写库，本副本要等同步任务轮询（3 秒）才会重载，
// 前端保存后立刻重拉的分组定价页会读到旧值、把表单重置回去。挂在该页用到的管理员读接口上，
// 让管理员读到的永远是库里的值；重载失败只记日志，退回用内存值响应。
func FreshOptions() gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := model.LoadOptionsFromDatabase(); err != nil {
			common.SysError(common.LogText("failed to reload options before serving %s: %s", c.Request.URL.Path, err.Error()))
		}
		c.Next()
	}
}
