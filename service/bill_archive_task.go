package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

// 账单账期包归档任务（TokenFunc 二开，仅 PostgreSQL）。每 5 分钟一轮，对每张已出账、未作废、未归档的账单：
//  1. 生成 bills/{bill_no}/statement.csv.gz：对账单冻结件，与账单详情页「导出 CSV（含明细）」同一装配函数；
//  2. 生成 bills/{bill_no}/raw-logs.csv.gz：企业主账号本账期的原始日志全列；
//  3. 两个对象上传并核对后，把登记写进 ent_bills.archive_info 并置 archived_at。
//
// 存量账单按出账时间顺序回填；对象存储未配置时只记一次日志不归档。失败的账单按指数退避重试，连续 3 次起通知管理员。
// logs 保留任务不删「仍有未归档账单」的账期内的天（见 logRetentionBillGuardDay），所以归档必须先于清理完成。
// 多副本下用 Redis 锁保证同一时刻只有一个实例执行；未启用 Redis 时只在 master 节点运行。

const (
	billArchiveTickInterval       = 5 * time.Minute
	billArchiveStartDelay         = 2 * time.Minute
	billArchiveLockKey            = "tokenfunc:bill_archive"
	billArchiveBatchPerTick       = 10
	billArchiveRetryBase          = 5 * time.Minute
	billArchiveRetryMax           = 6 * time.Hour
	billArchiveAlertAfterFailures = 3
)

var (
	billArchiveTaskOnce    sync.Once
	billArchiveTaskRunning atomic.Bool
	billArchiveStoreWarned atomic.Bool

	// billArchiveBackoff 失败账单的进程内指数退避；重启清零即立即重试
	billArchiveBackoffMu sync.Mutex
	billArchiveBackoff   = map[int64]billArchiveAttempt{}
)

type billArchiveAttempt struct {
	failures int
	nextAt   time.Time
}

// StartBillArchiveTask 启动账单归档任务；只支持 PostgreSQL，其他数据库直接不启动
func StartBillArchiveTask() {
	billArchiveTaskOnce.Do(func() {
		if !common.RedisEnabled && !common.IsMasterNode {
			return
		}
		if !common.UsingMainDatabase(common.DatabaseTypePostgreSQL) || !common.UsingLogDatabase(common.DatabaseTypePostgreSQL) {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("bill archive task started: tick=%s first_run_in=%s store_configured=%t",
				billArchiveTickInterval, billArchiveStartDelay, LogArchiveStoreConfig().Enabled()))
			time.Sleep(billArchiveStartDelay)
			runBillArchiveTick()
			ticker := time.NewTicker(billArchiveTickInterval)
			defer ticker.Stop()
			for range ticker.C {
				runBillArchiveTick()
			}
		})
	})
}

func runBillArchiveTick() {
	if !billArchiveTaskRunning.CompareAndSwap(false, true) {
		return
	}
	defer billArchiveTaskRunning.Store(false)
	ctx := context.Background()
	if common.RedisEnabled {
		locked, err := common.RDB.SetNX(ctx, billArchiveLockKey, common.NodeName, billArchiveTickInterval-5*time.Second).Result()
		if err != nil {
			logger.LogWarn(ctx, "bill archive lock failed: "+err.Error())
			return
		}
		if !locked {
			return
		}
	}
	runBillArchiveOnce(ctx, time.Now())
}

// runBillArchiveOnce 处理一批待归档账单；now 便于测试控制退避
func runBillArchiveOnce(ctx context.Context, now time.Time) {
	bills, err := model.ListBillsPendingArchive(billArchiveBatchPerTick)
	if err != nil {
		logger.LogWarn(ctx, "bill archive: list pending bills failed: "+err.Error())
		return
	}
	for _, bill := range bills {
		if ctx.Err() != nil {
			return
		}
		if !billArchiveReady(bill.Id, now) {
			continue
		}
		if _, err := ArchiveBill(ctx, bill); err != nil {
			if errors.Is(err, ErrLogArchiveStoreDisabled) {
				if billArchiveStoreWarned.CompareAndSwap(false, true) {
					logger.LogWarn(ctx, "bill archive: object store not configured (LOG_ARCHIVE_S3_*), bills stay unarchived")
				}
				return
			}
			failures, delay := billArchiveFail(bill.Id, now)
			logger.LogWarn(ctx, fmt.Sprintf("bill archive %s failed (%d in a row, retry in %s): %v", bill.BillNo, failures, delay, err))
			if failures >= billArchiveAlertAfterFailures {
				logArchiveAlert("bill_archive_fail:"+bill.BillNo, "Bill archive keeps failing",
					fmt.Sprintf("Bill %s (id=%d) failed to archive %d times in a row; next retry in %s.\nerror: %v", bill.BillNo, bill.Id, failures, delay, err))
			}
			continue
		}
		billArchiveSucceed(bill.Id)
	}
}

func billArchiveReady(billId int64, now time.Time) bool {
	billArchiveBackoffMu.Lock()
	defer billArchiveBackoffMu.Unlock()
	attempt, ok := billArchiveBackoff[billId]
	return !ok || !now.Before(attempt.nextAt)
}

func billArchiveFail(billId int64, now time.Time) (int, time.Duration) {
	billArchiveBackoffMu.Lock()
	defer billArchiveBackoffMu.Unlock()
	attempt := billArchiveBackoff[billId]
	attempt.failures++
	delay := billArchiveRetryBase
	for range attempt.failures - 1 {
		delay = min(delay*2, billArchiveRetryMax)
	}
	attempt.nextAt = now.Add(delay)
	billArchiveBackoff[billId] = attempt
	return attempt.failures, delay
}

func billArchiveSucceed(billId int64) {
	billArchiveBackoffMu.Lock()
	defer billArchiveBackoffMu.Unlock()
	delete(billArchiveBackoff, billId)
}

// ArchiveBill 为一张已出账账单生成账期包并登记。幂等：重跑覆盖同名对象、重写登记。
// 作废账单也允许手动归档（留证据），但任务不会自动处理它们。
func ArchiveBill(ctx context.Context, bill *model.EnterpriseBill) (model.BillArchiveInfo, error) {
	var info model.BillArchiveInfo
	if bill.BillNo == "" || bill.PeriodEnd <= bill.PeriodStart {
		return info, fmt.Errorf("bill %d has no bill_no or an empty period", bill.Id)
	}
	store, err := LogArchiveStore()
	if err != nil {
		return info, err
	}
	enterprise, err := model.GetEnterpriseById(bill.EnterpriseId)
	if err != nil {
		return info, fmt.Errorf("load enterprise %d: %w", bill.EnterpriseId, err)
	}
	r := model.FinanceRange{Start: bill.PeriodStart, EndExcl: bill.PeriodEnd}
	metadata := map[string]string{"bill-no": bill.BillNo, "user-id": fmt.Sprint(enterprise.UserId)}

	// 1. 对账单冻结件：与 HTTP 导出同一装配函数，含逐条明细
	statement, err := newArchiveFile()
	if err != nil {
		return info, err
	}
	defer statement.Remove()
	payload, err := BuildFinanceUsageCSVPayload(enterprise.UserId, r, true)
	if err != nil {
		return info, fmt.Errorf("build statement: %w", err)
	}
	if err := WriteFinanceUsageCSV(statement.Writer(), payload); err != nil {
		return info, fmt.Errorf("write statement: %w", err)
	}
	statementKey := store.Key(model.BillArchiveObjectKey(bill.BillNo, model.BillArchiveFileStatement)...)
	if err := statement.Upload(ctx, store, statementKey, metadata); err != nil {
		return info, err
	}
	statementBytes, statementSha, _, _ := statement.Finish()

	// 2. 原始日志全列：企业主账号本账期全部类型的日志（员工无登录账号，消耗都落在主账号）
	raw, err := newArchiveFile()
	if err != nil {
		return info, err
	}
	defer raw.Remove()
	stats, err := WriteLogsArchiveCSV(ctx, raw.Writer(), model.LogArchiveFilter{StartTs: bill.PeriodStart, EndTs: bill.PeriodEnd, UserIds: []int{enterprise.UserId}})
	if err != nil {
		return info, fmt.Errorf("write raw logs: %w", err)
	}
	rawKey := store.Key(model.BillArchiveObjectKey(bill.BillNo, model.BillArchiveFileRawLogs)...)
	if err := raw.Upload(ctx, store, rawKey, metadata); err != nil {
		return info, err
	}
	rawBytes, rawSha, _, _ := raw.Finish()

	info = model.BillArchiveInfo{
		Statement:     &model.BillArchiveObject{Key: statementKey, Bytes: statementBytes, Sha256: statementSha, Rows: int64(len(payload.Details))},
		RawLogs:       &model.BillArchiveObject{Key: rawKey, Bytes: rawBytes, Sha256: rawSha, Rows: stats.Rows},
		SchemaVersion: LogArchiveSchemaVersion,
		ArchivedAt:    common.GetTimestamp(),
	}
	if err := model.MarkBillArchived(bill.Id, info); err != nil {
		return info, err
	}
	raw0, _ := common.Marshal(info)
	bill.ArchiveInfo, bill.ArchivedAt = model.JSONValue(raw0), info.ArchivedAt
	common.SysLog(fmt.Sprintf("bill archive %s: statement=%dB detail_rows=%d raw_rows=%d raw=%dB", bill.BillNo, statementBytes, len(payload.Details), stats.Rows, rawBytes))
	return info, nil
}

// OpenBillArchiveObject 打开账期包里的一个对象供下载；返回正文、大小与建议文件名
func OpenBillArchiveObject(ctx context.Context, bill *model.EnterpriseBill, file string) (io.ReadCloser, int64, string, error) {
	object, err := bill.ArchiveObject(file)
	if err != nil {
		return nil, 0, "", err
	}
	store, err := LogArchiveStore()
	if err != nil {
		return nil, 0, "", err
	}
	info, err := store.Head(ctx, object.Key)
	if err != nil {
		return nil, 0, "", err
	}
	body, err := store.Get(ctx, object.Key)
	if err != nil {
		return nil, 0, "", err
	}
	return body, info.Size, bill.BillNo + "-" + file + ".csv.gz", nil
}
