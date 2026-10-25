package service

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedArchiveBill 用户 1 的企业与一张覆盖 03-10 / 03-11 两天的已出账账单
func seedArchiveBill(t *testing.T) *model.EnterpriseBill {
	t.Helper()
	loc := model.BillingLocation()
	require.NoError(t, model.DB.Create(&model.User{Id: 1, Username: "acme", Password: "password123", DisplayName: "acme", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Email: "acme@example.com"}).Error)
	enterprise := &model.Enterprise{UserId: 1, Name: "Acme Corp", BillingMode: model.EnterpriseBillingModeCredit, Status: model.EnterpriseStatusActive}
	require.NoError(t, model.DB.Create(enterprise).Error)
	now := common.GetTimestamp()
	bill := &model.EnterpriseBill{
		BillNo: "B-TEST-0001", EnterpriseId: enterprise.Id, BillType: model.EnterpriseBillTypeCredit, Status: model.EnterpriseBillUnpaid,
		PeriodStart: time.Date(2026, 3, 10, 0, 0, 0, 0, loc).Unix(), PeriodEnd: time.Date(2026, 3, 12, 0, 0, 0, 0, loc).Unix(),
		AmountQuota: 200, Currency: "USD", IssuedAt: now, CreatedAt: now, UpdatedAt: now,
	}
	require.NoError(t, model.DB.Create(bill).Error)
	return bill
}

// 账期包：冻结件与原始日志上传并登记；logs 保留任务在账单归档前止步、归档后放行；对象存储故障走退避并最终告警
func TestBillArchiveProducesPeriodPackageAndGuardsRetention(t *testing.T) {
	store := setupLogRetentionPostgres(t)
	seedRetentionLogs(t)
	bill := seedArchiveBill(t)
	ctx := context.Background()
	loc := model.BillingLocation()
	cutoff := time.Date(2026, 3, 13, 0, 0, 0, 0, loc).Unix()
	for _, day := range []string{"2026-03-10", "2026-03-11"} {
		_, err := model.RollupLogDay(day)
		require.NoError(t, err)
	}
	require.NoError(t, model.SetLogRollupCursor("2026-03-11"))

	// 账单未归档：03-09 起的天都不能清理
	result, err := PurgeArchivedLogsBefore(ctx, cutoff, 30, time.Minute)
	require.NoError(t, err)
	assert.Equal(t, "unarchived bill period from 2026-03-09", result.StoppedReason)
	assert.Equal(t, int64(0), result.RowsDeleted)
	_, err = RetryLogArchiveDay(ctx, "2026-03-10", time.Date(2026, 7, 1, 0, 0, 0, 0, loc))
	require.Error(t, err)

	// 对象存储故障：登记退避，连续三次告警
	store.failPut = errors.New("cos down")
	alerts := 0
	previousNotify := logArchiveNotify
	logArchiveNotify = func(subject, _ string) { alerts++ }
	t.Cleanup(func() { logArchiveNotify = previousNotify })
	now := time.Now()
	for i := range 3 {
		runBillArchiveOnce(ctx, now.Add(time.Duration(i)*24*time.Hour))
	}
	assert.Equal(t, 1, alerts, "第三次失败才告警，且去重")
	assert.False(t, billArchiveReady(bill.Id, now.Add(48*time.Hour+time.Minute)), "退避期内不重试")
	unarchived, err := model.GetEnterpriseBill(bill.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(0), unarchived.ArchivedAt)

	// 恢复后由任务归档
	store.failPut = nil
	runBillArchiveOnce(ctx, now.Add(30*24*time.Hour))
	archived, err := model.GetEnterpriseBill(bill.Id)
	require.NoError(t, err)
	require.NotZero(t, archived.ArchivedAt)
	info := archived.GetArchiveInfo()
	require.NotNil(t, info.Statement)
	require.NotNil(t, info.RawLogs)
	assert.Equal(t, "test/bills/B-TEST-0001/statement.csv.gz", info.Statement.Key)
	assert.Equal(t, "test/bills/B-TEST-0001/raw-logs.csv.gz", info.RawLogs.Key)
	assert.Equal(t, int64(8), info.RawLogs.Rows, "用户 1 两天 × 4 条全部类型")
	assert.Len(t, info.RawLogs.Sha256, 64)
	assert.Equal(t, LogArchiveSchemaVersion, info.SchemaVersion)
	assert.True(t, billArchiveReady(bill.Id, now), "成功后清退避")

	rawRecords := store.rows(t, info.RawLogs.Key)
	require.Len(t, rawRecords, 9)
	assert.Contains(t, rawRecords[0], "request_id")
	// 冻结件是多块 CSV（注释头 / 汇总 / 每日 / 明细），不按严格 CSV 解析，只核对内容与登记一致
	statementGz, err := gzip.NewReader(bytes.NewReader(store.objects[info.Statement.Key]))
	require.NoError(t, err)
	statementText, err := io.ReadAll(statementGz)
	require.NoError(t, err)
	assert.Contains(t, string(statementText), "Acme Corp")
	assert.Contains(t, string(statementText), "2026-03-11")
	assert.Equal(t, int64(len(store.objects[info.Statement.Key])), info.Statement.Bytes)

	// 下载入口：按文件名打开对象；未知文件名报错
	body, size, filename, err := OpenBillArchiveObject(ctx, archived, model.BillArchiveFileStatement)
	require.NoError(t, err)
	_ = body.Close()
	assert.Equal(t, info.Statement.Bytes, size)
	assert.Equal(t, "B-TEST-0001-statement.csv.gz", filename)
	_, _, _, err = OpenBillArchiveObject(ctx, archived, "nope")
	require.ErrorIs(t, err, model.ErrBillArchiveNotFound)

	// 归档后保留任务放行
	result, err = PurgeArchivedLogsBefore(ctx, cutoff, 30, time.Minute)
	require.NoError(t, err)
	assert.Equal(t, "rollup cursor at 2026-03-11", result.StoppedReason)
	assert.Equal(t, 2, result.DaysPurged)

	// 账单详情上下文：账期内已有天被清理
	billContext, err := model.GetFinanceBillContext(model.FinanceBillKindBill, bill.Id)
	require.NoError(t, err)
	assert.True(t, billContext.LogsPurged)

	// 作废账单不进任务队列；手动归档仍可用
	require.NoError(t, model.DB.Model(&model.EnterpriseBill{}).Where("id = ?", bill.Id).Updates(map[string]any{"archived_at": 0, "status": model.EnterpriseBillVoid}).Error)
	pending, err := model.ListBillsPendingArchive(10)
	require.NoError(t, err)
	assert.Empty(t, pending)
}
