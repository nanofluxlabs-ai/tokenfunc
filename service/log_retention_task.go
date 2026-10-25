package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

// logs 表保留任务（TokenFunc 二开，仅 PostgreSQL）：按上海日「先归档、校验通过、再删除」。
//
// 受 env DB_LOG_RETENTION_DAYS 控制（默认 0 = 禁用，任务空转，绝不删任何数据）。开启后每天在
// DB_LOG_RETENTION_RUN_AT（上海时间，默认 03:00）之后的第一个 tick 执行一次：从最早可归档的天开始，逐天把
// created_at 落在该天、且不属于资金流水类型的 logs 行全列导出为 .csv.gz 上传对象存储（LOG_ARCHIVE_S3_*），
// 核对大小 / MD5 后登记清单（tf_log_archive_manifests），再复核行数一致才分批删除。
//
// 四条红线：
//   - 对象存储未配置 → 拒绝删除；
//   - 只删「≤ 预聚合游标」的天：财务中心 / 推广中心的基础列靠 tf_log_daily_rollups，没聚合过的天不能删；
//   - 永不删除充值 / 管理员调额 / 退款（量小且是财务依据）；
//   - 进行中授信账期的企业主账号，从账期起点前一天起的行延后删除（出账前保留原始依据）。
//
// ⚠️ 与既有 LOG_RETENTION_DAYS（文件日志轮转天数，lumberjack）无关。

const (
	// logRetentionMinDays 保留期地板：配置 >0 且 <30 时强制按 30 天执行，防手滑删近期账务依据
	logRetentionMinDays = 30
	// logRetentionRunBudget 单次执行的墙钟预算，超过即停，剩余积压留到下一天
	logRetentionRunBudget    = 3 * time.Hour
	logRetentionTickInterval = time.Minute
	logRetentionLockKey      = "tokenfunc:log_retention"
	logRetentionLastRunKey   = "tf_log_retention_last_run"
	logRetentionDayLayout    = "2006-01-02"
	// logRetentionGuardBackdate 账期护栏往前多留 1 天，吸收跨零点的迟到写入
	logRetentionGuardBackdate = int64(86400)
	logArchiveAlertDedupe     = 24 * time.Hour
	logArchiveNotifyType      = "log_archive"
)

// logRetentionProtectedTypes 永不归档删除的日志类型（资金流水）
var logRetentionProtectedTypes = []int{model.LogTypeTopup, model.LogTypeManage, model.LogTypeRefund}

var (
	logRetentionTaskOnce    sync.Once
	logRetentionTaskRunning atomic.Bool
	logRetentionMu          sync.Mutex
	logRetentionLastRunAt   time.Time
	logRetentionLastResult  LogRetentionResult
	logRetentionLastErr     error
	logRetentionFloorWarned sync.Once

	logArchiveAlertMu   sync.Mutex
	logArchiveAlertSent = map[string]time.Time{}
	// logArchiveNotify 实际发送函数，测试替换
	logArchiveNotify = func(subject, content string) { NotifyRootUser(logArchiveNotifyType, subject, content) }
)

// LogRetentionResult 一轮归档清理的统计
type LogRetentionResult struct {
	CutoffDay     string `json:"cutoff_day"`
	DaysArchived  int    `json:"days_archived"`
	DaysPurged    int    `json:"days_purged"`
	RowsArchived  int64  `json:"rows_archived"`
	RowsDeleted   int64  `json:"rows_deleted"`
	StoppedReason string `json:"stopped_reason"`
	GuardedUsers  int    `json:"guarded_users"`
}

func (r LogRetentionResult) String() string {
	return fmt.Sprintf("cutoff_day=%s days_archived=%d days_purged=%d rows_archived=%d rows_deleted=%d stopped=%s guarded_users=%d",
		r.CutoffDay, r.DaysArchived, r.DaysPurged, r.RowsArchived, r.RowsDeleted, r.StoppedReason, r.GuardedUsers)
}

// EffectiveLogRetentionDays 把配置值规整为实际生效的保留天数：<=0 → 0（禁用）；1..29 → 地板 30；>=30 → 原值
func EffectiveLogRetentionDays(configured int) int {
	if configured <= 0 {
		return 0
	}
	if configured < logRetentionMinDays {
		logRetentionFloorWarned.Do(func() {
			common.SysLog(fmt.Sprintf("DB_LOG_RETENTION_DAYS=%d is below the safety floor, running with %d days", configured, logRetentionMinDays))
		})
		return logRetentionMinDays
	}
	return configured
}

// parseLogRetentionRunAt 解析 HH:MM 为当天分钟数；非法值回落 03:00
func parseLogRetentionRunAt(value string) int {
	hourText, minuteText, ok := strings.Cut(strings.TrimSpace(value), ":")
	if ok {
		hour, err1 := strconv.Atoi(hourText)
		minute, err2 := strconv.Atoi(minuteText)
		if err1 == nil && err2 == nil && hour >= 0 && hour < 24 && minute >= 0 && minute < 60 {
			return hour*60 + minute
		}
	}
	return 3 * 60
}

// StartLogRetentionTask 启动保留任务；多副本用 Redis 锁，未启用 Redis 时只在 master 运行；非 PG 不启动
func StartLogRetentionTask() {
	logRetentionTaskOnce.Do(func() {
		if !common.RedisEnabled && !common.IsMasterNode {
			return
		}
		if !common.UsingMainDatabase(common.DatabaseTypePostgreSQL) || !common.UsingLogDatabase(common.DatabaseTypePostgreSQL) {
			return
		}
		gopool.Go(func() {
			days := EffectiveLogRetentionDays(common.DBLogRetentionDays)
			logger.LogInfo(context.Background(), fmt.Sprintf("log retention task started: retention_days=%d run_at=%s store_configured=%t", days, common.DBLogRetentionRunAt, LogArchiveStoreConfig().Enabled()))
			ticker := time.NewTicker(logRetentionTickInterval)
			defer ticker.Stop()
			for range ticker.C {
				runLogRetentionTick(time.Now())
			}
		})
	})
}

// runLogRetentionTick 门控：禁用 / 未到执行时刻 / 当日已跑过（options 记录，多副本与重启后都生效）→ 跳过
func runLogRetentionTick(now time.Time) {
	if EffectiveLogRetentionDays(common.DBLogRetentionDays) == 0 {
		return
	}
	local := now.In(model.BillingLocation())
	if local.Hour()*60+local.Minute() < parseLogRetentionRunAt(common.DBLogRetentionRunAt) {
		return
	}
	if !logRetentionTaskRunning.CompareAndSwap(false, true) {
		return
	}
	defer logRetentionTaskRunning.Store(false)
	ctx := context.Background()
	if common.RedisEnabled {
		locked, err := common.RDB.SetNX(ctx, logRetentionLockKey, common.NodeName, logRetentionRunBudget+10*time.Minute).Result()
		if err != nil {
			logger.LogWarn(ctx, "log retention lock failed: "+err.Error())
			return
		}
		if !locked {
			return
		}
		defer common.RDB.Del(ctx, logRetentionLockKey)
	}
	dayKey := local.Format(logRetentionDayLayout)
	lastRun, err := model.GetTokenfuncOption(logRetentionLastRunKey)
	if err != nil {
		logger.LogWarn(ctx, "log retention read last run failed: "+err.Error())
		return
	}
	if lastRun == dayKey {
		return
	}
	// 无论成败都标记当日已跑（失败只记日志 + 告警，次日再试），避免错误每分钟刷屏
	if err := model.SetTokenfuncOption(logRetentionLastRunKey, dayKey); err != nil {
		logger.LogWarn(ctx, "log retention mark last run failed: "+err.Error())
		return
	}
	RunLogRetentionOnce(ctx, now)
}

// RunLogRetentionOnce 执行一轮归档清理并记录结果（手动重试与定时任务共用）
func RunLogRetentionOnce(ctx context.Context, now time.Time) (LogRetentionResult, error) {
	days := EffectiveLogRetentionDays(common.DBLogRetentionDays)
	cutoff := now.AddDate(0, 0, -days).Unix()
	result, err := PurgeArchivedLogsBefore(ctx, cutoff, common.DBLogRetentionMaxDaysPerRun, logRetentionRunBudget)
	logRetentionMu.Lock()
	logRetentionLastRunAt, logRetentionLastResult, logRetentionLastErr = now, result, err
	logRetentionMu.Unlock()
	if err != nil {
		common.SysError(fmt.Sprintf("log retention aborted: %s err=%v", result, err))
		logArchiveAlert("retention_aborted", "Log archive run aborted", fmt.Sprintf("Result: %s\nError: %v", result, err))
		return result, err
	}
	common.SysLog("log retention done: " + result.String())
	if summary, err := model.GetLogArchiveManifestSummary(); err == nil && summary.RowMismatchDays > 0 {
		logArchiveAlert("row_mismatch", "Log archive row mismatch", fmt.Sprintf("%d purged days have total_rows != purged_rows", summary.RowMismatchDays))
	}
	return result, nil
}

// LogRetentionStatus 管理端「归档清单」页的状态头
type LogRetentionStatus struct {
	Enabled          bool               `json:"enabled"`
	ConfiguredDays   int                `json:"configured_days"`
	EffectiveDays    int                `json:"effective_days"`
	RunAt            string             `json:"run_at"`
	StoreConfigured  bool               `json:"store_configured"`
	Bucket           string             `json:"bucket"`
	Prefix           string             `json:"prefix"`
	RollupCursor     string             `json:"rollup_cursor"`
	CutoffDay        string             `json:"cutoff_day"`
	LastRunAt        int64              `json:"last_run_at"`
	LastResult       LogRetentionResult `json:"last_result"`
	LastError        string             `json:"last_error"`
	ProtectedTypes   []int              `json:"protected_types"`
	MaxDaysPerRun    int                `json:"max_days_per_run"`
	BatchLimit       int                `json:"batch_limit"`
	BatchPauseMillis int                `json:"batch_pause_ms"`
}

func GetLogRetentionStatus(now time.Time) LogRetentionStatus {
	days := EffectiveLogRetentionDays(common.DBLogRetentionDays)
	cursor, _ := model.GetLogRollupCursor()
	status := LogRetentionStatus{
		Enabled: days > 0, ConfiguredDays: common.DBLogRetentionDays, EffectiveDays: days, RunAt: common.DBLogRetentionRunAt,
		StoreConfigured: LogArchiveStoreConfig().Enabled(), Bucket: common.LogArchiveS3Bucket, Prefix: common.LogArchiveS3Prefix,
		RollupCursor: cursor, ProtectedTypes: logRetentionProtectedTypes, MaxDaysPerRun: common.DBLogRetentionMaxDaysPerRun,
		BatchLimit: common.DBLogRetentionBatchLimit, BatchPauseMillis: common.DBLogRetentionBatchPauseMs,
	}
	if days > 0 {
		status.CutoffDay = model.FinanceDay(now.AddDate(0, 0, -days).Unix())
	}
	logRetentionMu.Lock()
	defer logRetentionMu.Unlock()
	if !logRetentionLastRunAt.IsZero() {
		status.LastRunAt = logRetentionLastRunAt.Unix()
		status.LastResult = logRetentionLastResult
	}
	if logRetentionLastErr != nil {
		status.LastError = logRetentionLastErr.Error()
	}
	return status
}

// logArchiveAlert 发送一条归档 / 清理告警（同一键 24h 去重）
func logArchiveAlert(key, subject, content string) bool {
	logArchiveAlertMu.Lock()
	if sent, ok := logArchiveAlertSent[key]; ok && time.Since(sent) < logArchiveAlertDedupe {
		logArchiveAlertMu.Unlock()
		return false
	}
	logArchiveAlertSent[key] = time.Now()
	logArchiveAlertMu.Unlock()
	logArchiveNotify(subject, content)
	return true
}

// loadLogRetentionGuards 进行中授信账期的企业主账号 → 从账期起点前一天起延后删除；查询失败即整轮放弃（fail-safe）
func loadLogRetentionGuards() (map[int]string, error) {
	owners, err := model.ListOpenCreditPeriodOwners()
	if err != nil {
		return nil, fmt.Errorf("query open credit periods: %w", err)
	}
	guards := make(map[int]string, len(owners))
	for userId, startAt := range owners {
		guards[userId] = model.FinanceDay(startAt - logRetentionGuardBackdate)
	}
	return guards, nil
}

// logRetentionBillGuardDay 未归档账单里最早账期开始日的前一天；该日起（含）的天不能清理，返回 "" 表示没有未归档账单
func logRetentionBillGuardDay() (string, error) {
	start, err := model.MinUnarchivedBillPeriodStart()
	if err != nil {
		return "", fmt.Errorf("query unarchived bills: %w", err)
	}
	if start == 0 {
		return "", nil
	}
	return model.FinanceDay(start - logRetentionGuardBackdate), nil
}

func guardedUserIdsForDay(guards map[int]string, day string) []int {
	ids := make([]int, 0)
	for userId, fromDay := range guards {
		if day >= fromDay {
			ids = append(ids, userId)
		}
	}
	return ids
}

// PurgeArchivedLogsBefore 归档并清理 created_at 早于 cutoffTs 所在上海日的 logs（不含资金流水类型）。
// 夜间任务与管理端手动重试共用；所有护栏集中在此。
func PurgeArchivedLogsBefore(ctx context.Context, cutoffTs int64, maxDays int, budget time.Duration) (LogRetentionResult, error) {
	result := LogRetentionResult{}
	store, err := LogArchiveStore()
	if err != nil {
		return result, err
	}
	if floor := time.Now().AddDate(0, 0, -logRetentionMinDays).Unix(); floor < cutoffTs {
		cutoffTs = floor
	}
	cutoffDay := model.FinanceDay(cutoffTs)
	result.CutoffDay = cutoffDay
	cursor, err := model.GetLogRollupCursor()
	if err != nil {
		return result, fmt.Errorf("read rollup cursor: %w", err)
	}
	if cursor == "" {
		result.StoppedReason = "rollup cursor empty"
		return result, nil
	}
	guards, err := loadLogRetentionGuards()
	if err != nil {
		return result, err
	}
	result.GuardedUsers = len(guards)
	billGuardDay, err := logRetentionBillGuardDay()
	if err != nil {
		return result, err
	}
	startDay, err := logRetentionStartDay()
	if err != nil {
		return result, err
	}
	if startDay == "" {
		result.StoppedReason = "no rows"
		return result, nil
	}
	if maxDays <= 0 {
		maxDays = 1
	}
	begin := time.Now()
	for day := startDay; day < cutoffDay; day = nextArchiveDay(day) {
		if err := ctx.Err(); err != nil {
			result.StoppedReason = "cancelled"
			return result, err
		}
		if day > cursor {
			result.StoppedReason = "rollup cursor at " + cursor
			return result, nil
		}
		if billGuardDay != "" && day >= billGuardDay {
			result.StoppedReason = "unarchived bill period from " + billGuardDay
			return result, nil
		}
		if result.DaysArchived >= maxDays {
			result.StoppedReason = "max days"
			return result, nil
		}
		if time.Since(begin) >= budget {
			result.StoppedReason = "budget"
			return result, nil
		}
		archived, deleted, hadRows, err := archiveAndPurgeLogDay(ctx, store, day, guardedUserIdsForDay(guards, day))
		result.RowsArchived += archived
		result.RowsDeleted += deleted
		if err != nil {
			result.StoppedReason = "error at " + day
			return result, err
		}
		if hadRows {
			result.DaysArchived++
			result.DaysPurged++
		}
	}
	result.StoppedReason = "reached cutoff"
	return result, nil
}

// RetryLogArchiveDay 管理端对单日重试：同样受保留期 / 游标 / 护栏约束，不允许提前清理
func RetryLogArchiveDay(ctx context.Context, day string, now time.Time) (*model.LogArchiveManifest, error) {
	if _, err := time.ParseInLocation(logRetentionDayLayout, day, model.BillingLocation()); err != nil {
		return nil, common.NewMessage("Invalid archive day")
	}
	days := EffectiveLogRetentionDays(common.DBLogRetentionDays)
	if days == 0 {
		return nil, common.NewMessage("Log retention is disabled")
	}
	cutoffDay := model.FinanceDay(now.AddDate(0, 0, -days).Unix())
	if day >= cutoffDay {
		return nil, common.NewMessage("Day {{day}} is still within the retention window", map[string]any{"day": day})
	}
	cursor, err := model.GetLogRollupCursor()
	if err != nil {
		return nil, err
	}
	if cursor == "" || day > cursor {
		return nil, common.NewMessage("Day {{day}} has not been rolled up yet", map[string]any{"day": day})
	}
	store, err := LogArchiveStore()
	if err != nil {
		return nil, common.NewMessage("Log archive object store is not configured")
	}
	billGuardDay, err := logRetentionBillGuardDay()
	if err != nil {
		return nil, err
	}
	if billGuardDay != "" && day >= billGuardDay {
		return nil, common.NewMessage("Day {{day}} belongs to a billing period whose bill is not archived yet", map[string]any{"day": day})
	}
	guards, err := loadLogRetentionGuards()
	if err != nil {
		return nil, err
	}
	if _, _, _, err := archiveAndPurgeLogDay(ctx, store, day, guardedUserIdsForDay(guards, day)); err != nil {
		return nil, err
	}
	return model.GetLogArchiveManifest(day)
}

func logRetentionStartDay() (string, error) {
	minTs, err := model.MinLogCreatedAtExcludingTypes(logRetentionProtectedTypes)
	if err != nil || minTs == 0 {
		return "", err
	}
	return model.FinanceDay(minTs), nil
}

func nextArchiveDay(day string) string {
	t, err := time.ParseInLocation(logRetentionDayLayout, day, model.BillingLocation())
	if err != nil {
		return day
	}
	return t.AddDate(0, 0, 1).Format(logRetentionDayLayout)
}

// archiveAndPurgeLogDay 单日：导出上传（或复用已 verified 的清单）→ 复核行数 → 分批删除 → 清单 purged。
// 返回 (归档行数, 删除行数, 该天是否有行, 错误)
func archiveAndPurgeLogDay(ctx context.Context, store ArchiveObjectStore, day string, excludeUsers []int) (int64, int64, bool, error) {
	dayRange, err := model.ParseFinanceDayRange(day, day)
	if err != nil {
		return 0, 0, false, err
	}
	manifest, err := model.GetLogArchiveManifest(day)
	if err != nil {
		return 0, 0, false, err
	}
	filter := model.LogArchiveFilter{StartTs: dayRange.Start, EndTs: dayRange.EndExcl, ExcludeTypes: logRetentionProtectedTypes, ExcludeUserIds: excludeUsers}
	if manifest != nil && manifest.Status == model.LogArchiveStatusPurged {
		// 已清理的天又出现可清理行（护栏解除 / 极少数迟到写入）：追加分片
		n, err := model.CountLogArchiveRows(filter)
		if err != nil || n == 0 {
			return 0, 0, false, err
		}
		common.SysLog(fmt.Sprintf("log archive %s: purged day has %d new rows, archiving as part %d", day, n, manifest.Parts+1))
		manifest.Status = model.LogArchiveStatusPending
		manifest.Parts++
		manifest.RowCount, manifest.MinId, manifest.MaxId, manifest.SumQuota, manifest.Bytes = 0, 0, 0, 0, 0
		manifest.ObjectKey, manifest.Sha256 = "", ""
	}
	var archivedRows int64
	if manifest == nil || manifest.Status != model.LogArchiveStatusVerified {
		manifest, err = archiveLogDay(ctx, store, day, filter, manifest)
		if err != nil {
			return 0, 0, true, err
		}
		archivedRows = manifest.RowCount
		if manifest.Status == model.LogArchiveStatusPurged {
			return 0, 0, false, nil
		}
	}
	filter.MaxId = manifest.MaxId
	count, err := model.CountLogArchiveRows(filter)
	if err != nil {
		return archivedRows, 0, true, err
	}
	if count != manifest.RowCount {
		manifest.Status = model.LogArchiveStatusPending
		manifest.LastError = fmt.Sprintf("recount %d != archived %d", count, manifest.RowCount)
		_ = model.UpsertLogArchiveManifest(manifest)
		return archivedRows, 0, true, errors.New("log archive " + day + ": " + manifest.LastError)
	}
	batchLimit, batchPause := common.DBLogRetentionBatchLimit, time.Duration(common.DBLogRetentionBatchPauseMs)*time.Millisecond
	var deleted int64
	for {
		if err := ctx.Err(); err != nil {
			return archivedRows, deleted, true, err
		}
		n, err := model.DeleteLogArchiveRowsBatch(filter, batchLimit)
		if err != nil {
			return archivedRows, deleted, true, err
		}
		deleted += n
		if n < int64(batchLimit) {
			break
		}
		select {
		case <-ctx.Done():
			return archivedRows, deleted, true, ctx.Err()
		case <-time.After(batchPause):
		}
	}
	if deleted != manifest.RowCount {
		message := fmt.Sprintf("log archive %s: deleted %d != archived %d", day, deleted, manifest.RowCount)
		common.SysError(message)
		logArchiveAlert("delete_mismatch:"+day, "Log archive delete mismatch", message+"\nobject: "+manifest.ObjectKey)
	}
	manifest.Status = model.LogArchiveStatusPurged
	manifest.PurgedRows += deleted
	manifest.TotalRows += manifest.RowCount
	manifest.PurgedAt = time.Now().Unix()
	manifest.LastError = ""
	if err := model.UpsertLogArchiveManifest(manifest); err != nil {
		return archivedRows, deleted, true, err
	}
	common.SysLog(fmt.Sprintf("log archive %s: purged rows=%d object=%s", day, deleted, manifest.ObjectKey))
	return archivedRows, deleted, true, nil
}

// archiveLogDay 导出该天并上传；0 行直接 purged（无对象）；失败回写 pending + last_error
func archiveLogDay(ctx context.Context, store ArchiveObjectStore, day string, filter model.LogArchiveFilter, existing *model.LogArchiveManifest) (*model.LogArchiveManifest, error) {
	manifest := existing
	if manifest == nil {
		manifest = &model.LogArchiveManifest{Day: day}
	}
	if manifest.Parts <= 0 {
		manifest.Parts = 1
	}
	file, err := newArchiveFile()
	if err != nil {
		return nil, err
	}
	defer file.Remove()
	stats, err := WriteLogsArchiveCSV(ctx, file.Writer(), filter)
	if err != nil {
		manifest.Status = model.LogArchiveStatusPending
		manifest.LastError = truncateArchiveError(err)
		_ = model.UpsertLogArchiveManifest(manifest)
		return nil, fmt.Errorf("log archive %s export: %w", day, err)
	}
	if stats.Rows == 0 {
		manifest.Status = model.LogArchiveStatusPurged
		manifest.RowCount, manifest.MinId, manifest.MaxId, manifest.SumQuota = 0, 0, 0, 0
		manifest.PurgedAt = time.Now().Unix()
		manifest.LastError = ""
		if err := model.UpsertLogArchiveManifest(manifest); err != nil {
			return nil, err
		}
		return manifest, nil
	}
	key := store.Key(model.LogArchiveObjectKey(day, manifest.Parts)...)
	err = file.Upload(ctx, store, key, map[string]string{
		"day": day, "rows": strconv.FormatInt(stats.Rows, 10), "schema-version": strconv.Itoa(LogArchiveSchemaVersion),
	})
	if err != nil {
		manifest.Status = model.LogArchiveStatusPending
		manifest.LastError = truncateArchiveError(err)
		_ = model.UpsertLogArchiveManifest(manifest)
		return nil, fmt.Errorf("log archive %s upload: %w", day, err)
	}
	size, sha, _, _ := file.Finish()
	manifest.Status = model.LogArchiveStatusVerified
	manifest.RowCount, manifest.MinId, manifest.MaxId, manifest.SumQuota = stats.Rows, stats.MinId, stats.MaxId, stats.SumQuota
	manifest.ObjectKey, manifest.Bytes, manifest.Sha256 = key, size, sha
	manifest.SchemaVersion = LogArchiveSchemaVersion
	manifest.LastError = ""
	if err := model.UpsertLogArchiveManifest(manifest); err != nil {
		return nil, err
	}
	common.SysLog(fmt.Sprintf("log archive %s: uploaded rows=%d bytes=%d object=%s", day, stats.Rows, size, key))
	return manifest, nil
}

func truncateArchiveError(err error) string {
	message := err.Error()
	if len(message) > 250 {
		return message[:250]
	}
	return message
}
