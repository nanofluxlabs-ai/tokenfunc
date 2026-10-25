package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	enterpriseCreditTickInterval = time.Minute
	enterpriseCreditLockKey      = "tokenfunc:enterprise_credit_task"
)

var (
	enterpriseCreditTaskOnce    sync.Once
	enterpriseCreditTaskRunning atomic.Bool
)

// StartEnterpriseCreditTask 每分钟滚动到期的授信账期。多副本部署下用 Redis 锁保证同一时刻只有一个实例执行；
// 未启用 Redis 时只在 master 节点运行。
func StartEnterpriseCreditTask() {
	enterpriseCreditTaskOnce.Do(func() {
		if !common.RedisEnabled && !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("enterprise credit task started: tick=%s", enterpriseCreditTickInterval))
			ticker := time.NewTicker(enterpriseCreditTickInterval)
			defer ticker.Stop()
			runEnterpriseCreditTaskOnce()
			for range ticker.C {
				runEnterpriseCreditTaskOnce()
			}
		})
	})
}

func runEnterpriseCreditTaskOnce() {
	if !enterpriseCreditTaskRunning.CompareAndSwap(false, true) {
		return
	}
	defer enterpriseCreditTaskRunning.Store(false)
	ctx := context.Background()
	if common.RedisEnabled {
		locked, err := common.RDB.SetNX(ctx, enterpriseCreditLockKey, common.NodeName, enterpriseCreditTickInterval-5*time.Second).Result()
		if err != nil {
			logger.LogWarn(ctx, "enterprise credit task lock failed: "+err.Error())
			return
		}
		if !locked {
			return
		}
	}
	now := common.GetTimestamp()
	rolled, err := model.RolloverDueCreditPeriods(now)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("enterprise credit rollover failed: %v", err))
		return
	}
	if rolled > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("enterprise credit periods rolled over: %d", rolled))
	}
	// 员工 key 周期限额（M4）：到点把 remain_quota 恢复到周期额度
	reset, err := model.ResetDueTokenQuotaPolicies(now)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("enterprise token quota reset failed after %d keys: %v", reset, err))
	} else if reset > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("enterprise token periodic quotas reset: %d", reset))
	}
	runEnterpriseBillingOnce(ctx, now)
}
