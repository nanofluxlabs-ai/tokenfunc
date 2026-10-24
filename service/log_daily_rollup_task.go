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

// logs 按天预聚合的维护任务（TokenFunc 二开）。每小时一轮：
//  1. 从游标的下一天补到昨天（首次部署从最早日志起，最多回看 logDailyRollupMaxLookbackDays 天）；
//  2. 昨天在上一轮已经算过的话，再重算一次吸收跨零点的迟到写入，之后当天不再重算；
//  3. 今天永远不写，读侧对今天实时查 logs。
//
// 多副本下用 Redis 锁保证同一时刻只有一个实例执行；未启用 Redis 时只在 master 节点运行。

const (
	logDailyRollupTickInterval    = time.Hour
	logDailyRollupStartDelay      = time.Minute
	logDailyRollupLockKey         = "tokenfunc:log_daily_rollup"
	logDailyRollupMaxLookbackDays = 400
	// logDailyRollupDayPause 连续补多天时每天之间的停顿，避免首次回填把日志库 CPU 打满
	logDailyRollupDayPause = 300 * time.Millisecond
)

var (
	logDailyRollupTaskOnce    sync.Once
	logDailyRollupTaskRunning atomic.Bool
)

// StartLogDailyRollupTask 启动预聚合维护任务；只支持 PostgreSQL，其他数据库直接不启动
func StartLogDailyRollupTask() {
	logDailyRollupTaskOnce.Do(func() {
		if !common.RedisEnabled && !common.IsMasterNode {
			return
		}
		if !common.UsingMainDatabase(common.DatabaseTypePostgreSQL) || !common.UsingLogDatabase(common.DatabaseTypePostgreSQL) {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("log daily rollup task started: tick=%s first_run_in=%s", logDailyRollupTickInterval, logDailyRollupStartDelay))
			time.Sleep(logDailyRollupStartDelay)
			runLogDailyRollupTick()
			ticker := time.NewTicker(logDailyRollupTickInterval)
			defer ticker.Stop()
			for range ticker.C {
				runLogDailyRollupTick()
			}
		})
	})
}

func runLogDailyRollupTick() {
	if !logDailyRollupTaskRunning.CompareAndSwap(false, true) {
		return
	}
	defer logDailyRollupTaskRunning.Store(false)
	ctx := context.Background()
	if common.RedisEnabled {
		locked, err := common.RDB.SetNX(ctx, logDailyRollupLockKey, common.NodeName, logDailyRollupTickInterval-5*time.Second).Result()
		if err != nil {
			logger.LogWarn(ctx, "log daily rollup lock failed: "+err.Error())
			return
		}
		if !locked {
			return
		}
	}
	if err := runLogDailyRollupOnce(ctx, time.Now(), logDailyRollupDayPause); err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("log daily rollup failed: %v", err))
	}
}

// runLogDailyRollupOnce 执行一轮补齐 + 昨天重算；now 由调用方传入便于测试，pause 为逐日之间的停顿
func runLogDailyRollupOnce(ctx context.Context, now time.Time, pause time.Duration) error {
	loc := model.BillingLocation()
	now = now.In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	yesterday := today.AddDate(0, 0, -1)
	yesterdayDay := yesterday.Format("2006-01-02")

	cursor, err := model.GetLogRollupCursor()
	if err != nil {
		return fmt.Errorf("read cursor: %w", err)
	}
	var from time.Time
	if cursor != "" {
		cursorDay, err := time.ParseInLocation("2006-01-02", cursor, loc)
		if err != nil {
			return fmt.Errorf("invalid cursor %q: %w", cursor, err)
		}
		from = cursorDay.AddDate(0, 0, 1)
	} else {
		oldest, err := model.OldestLogDay()
		if err != nil {
			return fmt.Errorf("read oldest log day: %w", err)
		}
		if oldest == "" {
			return nil
		}
		from, _ = time.ParseInLocation("2006-01-02", oldest, loc)
	}
	if lookbackLimit := today.AddDate(0, 0, -logDailyRollupMaxLookbackDays); from.Before(lookbackLimit) {
		from = lookbackLimit
	}

	// 从游标的下一天补到昨天；每补完一天就推进游标，中途失败不丢进度
	caughtUp := false
	for day := from; !day.After(yesterday); day = day.AddDate(0, 0, 1) {
		if err := ctx.Err(); err != nil {
			return err
		}
		dayText := day.Format("2006-01-02")
		rows, err := model.RollupLogDay(dayText)
		if err != nil {
			return fmt.Errorf("rollup %s: %w", dayText, err)
		}
		if err := model.SetLogRollupCursor(dayText); err != nil {
			return fmt.Errorf("advance cursor to %s: %w", dayText, err)
		}
		logger.LogInfo(ctx, fmt.Sprintf("log daily rollup: day=%s rows=%d", dayText, rows))
		caughtUp = true
		if pause > 0 && day.Before(yesterday) {
			time.Sleep(pause)
		}
	}
	if caughtUp {
		// 本轮刚算过昨天，迟到写入可能还没到齐，留给下一轮重算
		return nil
	}

	// 昨天在之前的轮次已经算过：当天只重算一次
	done, err := model.GetLogRollupYesterdayDone()
	if err != nil {
		return fmt.Errorf("read yesterday flag: %w", err)
	}
	if done == yesterdayDay {
		return nil
	}
	rows, err := model.RollupLogDay(yesterdayDay)
	if err != nil {
		return fmt.Errorf("re-rollup %s: %w", yesterdayDay, err)
	}
	if err := model.SetLogRollupYesterdayDone(yesterdayDay); err != nil {
		return fmt.Errorf("mark yesterday done: %w", err)
	}
	logger.LogInfo(ctx, fmt.Sprintf("log daily rollup: re-rolled yesterday day=%s rows=%d", yesterdayDay, rows))
	return nil
}
