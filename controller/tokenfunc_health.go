package controller

import (
	"context"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// 健康探针（TokenFunc 二开，给 k8s / compose healthcheck 用，匿名、无鉴权、不计入访问令牌规则）：
//   - /api/health/live  进程活着就 200，不依赖任何外部依赖，用作 livenessProbe，避免 DB 抖动时被 kubelet 连环重启
//   - /api/health/ready 主库 + Redis（启用时）都能 ping 通才 200，否则 503，用作 readinessProbe 把 Pod 摘出 Service

const healthReadyTimeout = 3 * time.Second

func GetLiveHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "service is alive",
		"data":    gin.H{"live": true, "version": common.Version, "node": common.NodeName},
	})
}

// HealthReadyStatus readiness 的各项检查结果
type HealthReadyStatus struct {
	Ready   bool   `json:"ready"`
	DB      bool   `json:"db"`
	Redis   bool   `json:"redis"`
	Version string `json:"version"`
	Node    string `json:"node"`
	Error   string `json:"error,omitempty"`
}

func GetReadyHealth(c *gin.Context) {
	status := HealthReadyStatus{Version: common.Version, Node: common.NodeName, Redis: !common.RedisEnabled}
	if err := model.PingDB(); err != nil {
		status.Error = "db: " + err.Error()
	} else {
		status.DB = true
	}
	if common.RedisEnabled {
		ctx, cancel := context.WithTimeout(c.Request.Context(), healthReadyTimeout)
		defer cancel()
		if _, err := common.RDB.Ping(ctx).Result(); err != nil {
			if status.Error != "" {
				status.Error += "; "
			}
			status.Error += "redis: " + err.Error()
		} else {
			status.Redis = true
		}
	}
	status.Ready = status.DB && status.Redis
	code, message := http.StatusOK, "service is ready"
	if !status.Ready {
		code, message = http.StatusServiceUnavailable, "service is not ready"
	}
	c.JSON(code, gin.H{"success": status.Ready, "message": message, "data": status})
}
