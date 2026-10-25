package service

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/csv"
	"errors"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/objectstore"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// memoryArchiveStore 内存对象存储替身：记录上传的对象，可注入上传失败
type memoryArchiveStore struct {
	mu      sync.Mutex
	objects map[string][]byte
	failPut error
}

func newMemoryArchiveStore() *memoryArchiveStore {
	return &memoryArchiveStore{objects: map[string][]byte{}}
}

func (m *memoryArchiveStore) Key(parts ...string) string { return "test/" + strings.Join(parts, "/") }

func (m *memoryArchiveStore) Put(_ context.Context, key string, body io.ReadSeeker, size int64, _ string, _ map[string]string) (string, error) {
	if m.failPut != nil {
		return "", m.failPut
	}
	// 与真实客户端一致：从头读
	if _, err := body.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	data, err := io.ReadAll(body)
	if err != nil {
		return "", err
	}
	if int64(len(data)) != size {
		return "", errors.New("size mismatch")
	}
	m.mu.Lock()
	m.objects[key] = data
	m.mu.Unlock()
	return "not-an-md5", nil
}

func (m *memoryArchiveStore) Head(_ context.Context, key string) (objectstore.ObjectInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.objects[key]
	if !ok {
		return objectstore.ObjectInfo{}, errors.New("not found")
	}
	return objectstore.ObjectInfo{Size: int64(len(data)), ETag: "not-an-md5"}, nil
}

// rows 解压并解析归档 CSV
func (m *memoryArchiveStore) rows(t *testing.T, key string) [][]string {
	t.Helper()
	m.mu.Lock()
	data, ok := m.objects[key]
	m.mu.Unlock()
	require.True(t, ok, "object %s missing", key)
	gz, err := gzip.NewReader(bytes.NewReader(data))
	require.NoError(t, err)
	records, err := csv.NewReader(gz).ReadAll()
	require.NoError(t, err)
	return records
}

func setupLogRetentionPostgres(t *testing.T) *memoryArchiveStore {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	tables := []any{&model.User{}, &model.Log{}, &model.Option{}, &model.Enterprise{}, &model.EnterpriseCreditPeriod{}, &model.LogDailyRollup{}, &model.LogArchiveManifest{}}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousDays, previousRunAt, previousRedis := common.DBLogRetentionDays, common.DBLogRetentionRunAt, common.RedisEnabled
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.RedisEnabled = false
	model.InitColumnNames()
	store := newMemoryArchiveStore()
	setLogArchiveStoreForTest(store)
	alerts := make([]string, 0)
	previousNotify := logArchiveNotify
	logArchiveNotify = func(subject, _ string) { alerts = append(alerts, subject) }
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.DBLogRetentionDays, common.DBLogRetentionRunAt, common.RedisEnabled = previousDays, previousRunAt, previousRedis
		resetLogArchiveStoreForTest()
		logArchiveNotify = previousNotify
		logArchiveAlertMu.Lock()
		logArchiveAlertSent = map[string]time.Time{}
		logArchiveAlertMu.Unlock()
		model.InitColumnNames()
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
	return store
}

// 种子：2026-03-10 / 11 / 12 三天，用户 1 与 2，每天消费 + 错误 + 受保护的充值 / 退款
func seedRetentionLogs(t *testing.T) {
	t.Helper()
	loc := model.BillingLocation()
	for d := range 3 {
		base := time.Date(2026, 3, 10+d, 0, 0, 0, 0, loc)
		at := func(hour int) int64 { return base.Add(time.Duration(hour) * time.Hour).Unix() }
		for _, userId := range []int{1, 2} {
			require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: userId, Username: "u", Type: model.LogTypeConsume, ModelName: "gpt-4o", Group: "default", Quota: 100 * userId, PromptTokens: 10, CompletionTokens: 5, CreatedAt: at(9), Other: `{"a":1}`}).Error)
			require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: userId, Username: "u", Type: model.LogTypeError, ModelName: "gpt-4o", Content: "boom", CreatedAt: at(10)}).Error)
			require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: userId, Username: "u", Type: model.LogTypeTopup, Quota: 999, CreatedAt: at(11)}).Error)
			require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: userId, Username: "u", Type: model.LogTypeRefund, Quota: 7, CreatedAt: at(12)}).Error)
		}
	}
}

func countRetentionLogs(t *testing.T, where string, args ...any) int64 {
	t.Helper()
	var count int64
	require.NoError(t, model.LOG_DB.Model(&model.Log{}).Where(where, args...).Count(&count).Error)
	return count
}

func TestLogRetentionArchivesVerifiesThenPurgesWithinRollupCursor(t *testing.T) {
	store := setupLogRetentionPostgres(t)
	seedRetentionLogs(t)
	ctx := context.Background()
	cutoff := time.Date(2026, 3, 13, 0, 0, 0, 0, model.BillingLocation()).Unix()

	// 游标为空：拒绝删除
	result, err := PurgeArchivedLogsBefore(ctx, cutoff, 30, time.Minute)
	require.NoError(t, err)
	assert.Equal(t, "rollup cursor empty", result.StoppedReason)
	assert.Equal(t, int64(24), countRetentionLogs(t, "1 = 1"))

	// 游标到 03-11：只能处理 03-10 / 03-11，03-12 留着
	for _, day := range []string{"2026-03-10", "2026-03-11"} {
		_, err := model.RollupLogDay(day)
		require.NoError(t, err)
	}
	require.NoError(t, model.SetLogRollupCursor("2026-03-11"))
	result, err = PurgeArchivedLogsBefore(ctx, cutoff, 30, time.Minute)
	require.NoError(t, err)
	assert.Equal(t, "rollup cursor at 2026-03-11", result.StoppedReason)
	assert.Equal(t, 2, result.DaysPurged)
	assert.Equal(t, int64(8), result.RowsArchived) // 每天 2 用户 × (消费 + 错误)
	assert.Equal(t, int64(8), result.RowsDeleted)

	// 受保护类型全部保留；03-12 全部保留
	assert.Equal(t, int64(12), countRetentionLogs(t, "type IN ?", []int{model.LogTypeTopup, model.LogTypeRefund}))
	assert.Equal(t, int64(8), countRetentionLogs(t, "created_at >= ?", time.Date(2026, 3, 12, 0, 0, 0, 0, model.BillingLocation()).Unix()))
	assert.Equal(t, int64(0), countRetentionLogs(t, "type IN ? AND created_at < ?", []int{model.LogTypeConsume, model.LogTypeError}, time.Date(2026, 3, 12, 0, 0, 0, 0, model.BillingLocation()).Unix()))

	// 清单与对象：CSV 首行列名、行数一致、quota 合计一致
	manifest, err := model.GetLogArchiveManifest("2026-03-10")
	require.NoError(t, err)
	require.NotNil(t, manifest)
	assert.Equal(t, model.LogArchiveStatusPurged, manifest.Status)
	assert.Equal(t, int64(4), manifest.RowCount)
	assert.Equal(t, int64(4), manifest.PurgedRows)
	assert.Equal(t, int64(100+200), manifest.SumQuota)
	assert.Equal(t, "test/logs/2026-03-10.csv.gz", manifest.ObjectKey)
	assert.Len(t, manifest.Sha256, 64)
	records := store.rows(t, manifest.ObjectKey)
	require.Len(t, records, 5)
	assert.Contains(t, records[0], "id")
	assert.Contains(t, records[0], "other")
	missing, err := model.GetLogArchiveManifest("2026-03-12")
	require.NoError(t, err)
	assert.Nil(t, missing)

	// 预聚合仍给出被删天的消耗
	rows, err := model.ReadLogDailyUsage(nil, model.FinanceRange{Start: time.Date(2026, 3, 10, 0, 0, 0, 0, model.BillingLocation()).Unix(), EndExcl: cutoff})
	require.NoError(t, err)
	byDay := model.FoldLogDailyUsage(rows, func(row model.LogDailyUsageRow) string { return row.Day })
	assert.Equal(t, int64(300-14), byDay["2026-03-10"].NetQuota)

	// 再跑一轮：已清理的天没有新行，不重复归档
	result, err = PurgeArchivedLogsBefore(ctx, cutoff, 30, time.Minute)
	require.NoError(t, err)
	assert.Equal(t, 0, result.DaysPurged)
	assert.Len(t, store.objects, 2)
}

func TestLogRetentionKeepsRowsWhenUploadFailsAndRetries(t *testing.T) {
	store := setupLogRetentionPostgres(t)
	seedRetentionLogs(t)
	ctx := context.Background()
	_, err := model.RollupLogDay("2026-03-10")
	require.NoError(t, err)
	require.NoError(t, model.SetLogRollupCursor("2026-03-10"))
	cutoff := time.Date(2026, 3, 13, 0, 0, 0, 0, model.BillingLocation()).Unix()

	store.failPut = errors.New("cos down")
	result, err := PurgeArchivedLogsBefore(ctx, cutoff, 30, time.Minute)
	require.Error(t, err)
	assert.Equal(t, "error at 2026-03-10", result.StoppedReason)
	assert.Equal(t, int64(24), countRetentionLogs(t, "1 = 1"), "upload failure must not delete anything")
	manifest, err := model.GetLogArchiveManifest("2026-03-10")
	require.NoError(t, err)
	require.NotNil(t, manifest)
	assert.Equal(t, model.LogArchiveStatusPending, manifest.Status)
	assert.Contains(t, manifest.LastError, "cos down")

	// 管理端重试：仍在保留期内的天拒绝；对象存储恢复后成功
	common.DBLogRetentionDays = 90
	_, err = RetryLogArchiveDay(ctx, time.Now().In(model.BillingLocation()).Format("2006-01-02"), time.Now())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "still within the retention window")
	_, err = RetryLogArchiveDay(ctx, "2026-03-11", time.Now())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "has not been rolled up yet")
	store.failPut = nil
	retried, err := RetryLogArchiveDay(ctx, "2026-03-10", time.Now())
	require.NoError(t, err)
	assert.Equal(t, model.LogArchiveStatusPurged, retried.Status)
	assert.Equal(t, "", retried.LastError)
	assert.Equal(t, int64(20), countRetentionLogs(t, "1 = 1"))
}

func TestLogRetentionGuardsOpenCreditPeriodOwners(t *testing.T) {
	setupLogRetentionPostgres(t)
	seedRetentionLogs(t)
	ctx := context.Background()
	// 用户 2 是授信企业主账号，账期从 03-11 起 → 03-10（起点前一天）及之后的行延后删除
	require.NoError(t, model.DB.Create(&model.Enterprise{Id: 1, UserId: 2, Name: "Guarded", BillingMode: model.EnterpriseBillingModeCredit, Currency: "USD"}).Error)
	periodStart := time.Date(2026, 3, 11, 0, 0, 0, 0, model.BillingLocation()).Unix()
	require.NoError(t, model.DB.Create(&model.EnterpriseCreditPeriod{EnterpriseId: 1, PeriodNo: 1, Status: model.EnterpriseCreditPeriodOpen, StartAt: periodStart, EndAt: periodStart + 30*86400, LimitQuota: 1}).Error)
	for _, day := range []string{"2026-03-10", "2026-03-11"} {
		_, err := model.RollupLogDay(day)
		require.NoError(t, err)
	}
	require.NoError(t, model.SetLogRollupCursor("2026-03-11"))

	result, err := PurgeArchivedLogsBefore(ctx, time.Date(2026, 3, 13, 0, 0, 0, 0, model.BillingLocation()).Unix(), 30, time.Minute)
	require.NoError(t, err)
	assert.Equal(t, 1, result.GuardedUsers)
	assert.Equal(t, int64(4), result.RowsDeleted, "only user 1's consume/error rows on two days")
	assert.Equal(t, int64(6), countRetentionLogs(t, "user_id = 2 AND type IN ?", []int{model.LogTypeConsume, model.LogTypeError}), "guarded owner keeps every row on all three days")
	manifest, err := model.GetLogArchiveManifest("2026-03-10")
	require.NoError(t, err)
	assert.Equal(t, int64(2), manifest.RowCount)
}

func TestLogRetentionTickRunsOncePerDayAfterRunAt(t *testing.T) {
	setupLogRetentionPostgres(t)
	seedRetentionLogs(t)
	_, err := model.RollupLogDay("2026-03-10")
	require.NoError(t, err)
	require.NoError(t, model.SetLogRollupCursor("2026-03-10"))
	loc := model.BillingLocation()

	// 禁用：不动
	common.DBLogRetentionDays = 0
	runLogRetentionTick(time.Date(2026, 10, 25, 4, 0, 0, 0, loc))
	assert.Equal(t, int64(24), countRetentionLogs(t, "1 = 1"))

	// 开启但未到执行时刻：不动
	common.DBLogRetentionDays, common.DBLogRetentionRunAt = 90, "03:00"
	runLogRetentionTick(time.Date(2026, 10, 25, 2, 59, 0, 0, loc))
	assert.Equal(t, int64(24), countRetentionLogs(t, "1 = 1"))

	// 到点：跑一轮（游标只到 03-10 → 删该天 2 用户 × 2 类 = 4 行）并记下当日
	runLogRetentionTick(time.Date(2026, 10, 25, 3, 1, 0, 0, loc))
	assert.Equal(t, int64(20), countRetentionLogs(t, "1 = 1"))
	lastRun, err := model.GetTokenfuncOption(logRetentionLastRunKey)
	require.NoError(t, err)
	assert.Equal(t, "2026-10-25", lastRun)
	status := GetLogRetentionStatus(time.Date(2026, 10, 25, 3, 2, 0, 0, loc))
	assert.True(t, status.Enabled)
	assert.Equal(t, 90, status.EffectiveDays)
	assert.Equal(t, "2026-07-27", status.CutoffDay)
	assert.Equal(t, 1, status.LastResult.DaysPurged)

	// 同一天再 tick：不重复跑（即使游标推进了）
	_, err = model.RollupLogDay("2026-03-11")
	require.NoError(t, err)
	require.NoError(t, model.SetLogRollupCursor("2026-03-11"))
	runLogRetentionTick(time.Date(2026, 10, 25, 5, 0, 0, 0, loc))
	assert.Equal(t, int64(20), countRetentionLogs(t, "1 = 1"))
}

func TestEffectiveLogRetentionDaysAndRunAt(t *testing.T) {
	assert.Equal(t, 0, EffectiveLogRetentionDays(0))
	assert.Equal(t, 0, EffectiveLogRetentionDays(-5))
	assert.Equal(t, 30, EffectiveLogRetentionDays(10))
	assert.Equal(t, 90, EffectiveLogRetentionDays(90))
	assert.Equal(t, 3*60, parseLogRetentionRunAt(""))
	assert.Equal(t, 3*60, parseLogRetentionRunAt("25:00"))
	assert.Equal(t, 4*60+30, parseLogRetentionRunAt("04:30"))
}

func TestLogRetentionRefusesWithoutObjectStore(t *testing.T) {
	setupLogRetentionPostgres(t)
	seedRetentionLogs(t)
	setLogArchiveStoreForTest(nil)
	_, err := model.RollupLogDay("2026-03-10")
	require.NoError(t, err)
	require.NoError(t, model.SetLogRollupCursor("2026-03-10"))
	_, err = PurgeArchivedLogsBefore(context.Background(), time.Date(2026, 3, 13, 0, 0, 0, 0, model.BillingLocation()).Unix(), 30, time.Minute)
	assert.ErrorIs(t, err, ErrLogArchiveStoreDisabled)
	assert.Equal(t, int64(24), countRetentionLogs(t, "1 = 1"))
}
