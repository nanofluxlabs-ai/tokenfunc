package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/objectstore"
	"github.com/QuantumNous/new-api/service"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// memoryStore 内存对象存储：key → 内容，Head 带 sha256 元数据
type memoryStore struct {
	objects map[string][]byte
}

func (m *memoryStore) Key(parts ...string) string {
	key := "prefix"
	for _, part := range parts {
		key += "/" + part
	}
	return key
}

func (m *memoryStore) Head(_ context.Context, key string) (objectstore.ObjectInfo, error) {
	data, ok := m.objects[key]
	if !ok {
		return objectstore.ObjectInfo{}, os.ErrNotExist
	}
	sum := sha256.Sum256(data)
	return objectstore.ObjectInfo{Size: int64(len(data)), Metadata: map[string]string{"sha256": hex.EncodeToString(sum[:])}}, nil
}

func (m *memoryStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	data, ok := m.objects[key]
	if !ok {
		return nil, os.ErrNotExist
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

const testTable = "tf_logs_archive_test"

// 用真实导出器生成归档，再导回回放表：行数与清单一致、字符串列的空值保持空串、重复导入按天替换、校验失败不落库
func TestImportDayRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	ctx := context.Background()
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	model.InitColumnNames()
	tables := []any{&model.Log{}, &model.LogArchiveManifest{}}
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.Exec("DROP TABLE IF EXISTS "+testTable).Error)
	require.NoError(t, db.AutoMigrate(tables...))
	t.Cleanup(func() {
		_ = db.Migrator().DropTable(tables...)
		_ = db.Exec("DROP TABLE IF EXISTS " + testTable).Error
	})

	day := "2026-03-10"
	r, err := model.ParseFinanceDayRange(day, day)
	require.NoError(t, err)
	next, err := model.ParseFinanceDayRange("2026-03-11", "2026-03-11")
	require.NoError(t, err)
	logs := []model.Log{
		{UserId: 1, Username: "u1", Type: model.LogTypeConsume, ModelName: "gpt-4o", Content: "hello", Other: "", Quota: 10, CreatedAt: r.Start + 3600},
		{UserId: 2, Username: "u2", Type: model.LogTypeConsume, ModelName: "claude-3", Content: "", Other: `{"a":1}`, Quota: 20, CreatedAt: r.Start + 7200},
		{UserId: 1, Username: "u1", Type: model.LogTypeConsume, ModelName: "gpt-4o", Content: "next day", Quota: 30, CreatedAt: next.Start + 60},
	}
	for i := range logs {
		require.NoError(t, db.Create(&logs[i]).Error)
	}

	// 用主服务的导出器生成归档文件，保证编码一致
	var gz bytes.Buffer
	gzWriter := gzip.NewWriter(&gz)
	stats, err := service.WriteLogsArchiveCSV(ctx, gzWriter, model.LogArchiveFilter{StartTs: r.Start, EndTs: r.EndExcl})
	require.NoError(t, err)
	require.NoError(t, gzWriter.Close())
	require.Equal(t, int64(2), stats.Rows)
	sum := sha256.Sum256(gz.Bytes())
	store := &memoryStore{objects: map[string][]byte{}}
	key := store.Key(model.LogArchiveObjectKey(day, 1)...)
	store.objects[key] = gz.Bytes()
	require.NoError(t, db.Create(&model.LogArchiveManifest{Day: day, Status: model.LogArchiveStatusVerified, Parts: 1, TotalRows: 2, RowCount: 2,
		Sha256: hex.EncodeToString(sum[:]), ObjectKey: key}).Error)

	conn, err := pgx.Connect(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close(ctx) })
	var out bytes.Buffer
	im := &importer{store: store, mainConn: conn, logConn: conn, table: testTable, out: &out}
	require.NoError(t, im.ensureTable(ctx))

	imported, err := im.importDay(ctx, day)
	require.NoError(t, err)
	assert.Equal(t, int64(2), imported)
	type replayRow struct {
		Id      int
		Content *string
		Other   *string
		Quota   int
	}
	var rows []replayRow
	require.NoError(t, db.Table(testTable).Order("id").Scan(&rows).Error)
	require.Len(t, rows, 2)
	assert.Equal(t, logs[0].Id, rows[0].Id, "保留原 id")
	require.NotNil(t, rows[0].Other)
	assert.Equal(t, "", *rows[0].Other, "字符串列的空值导回为空串而不是 NULL")
	require.NotNil(t, rows[0].Content)
	assert.Equal(t, "hello", *rows[0].Content)
	require.NotNil(t, rows[1].Content)
	assert.Equal(t, "", *rows[1].Content)
	assert.Equal(t, `{"a":1}`, *rows[1].Other)
	assert.Equal(t, 30, rows[0].Quota+rows[1].Quota)
	assert.Contains(t, out.String(), "verified "+key)

	// 重复导入：该天先删后插，不翻倍
	imported, err = im.importDay(ctx, day)
	require.NoError(t, err)
	assert.Equal(t, int64(2), imported)
	var count int64
	require.NoError(t, db.Table(testTable).Count(&count).Error)
	assert.Equal(t, int64(2), count)

	// 只校验：不写库
	require.NoError(t, db.Exec("TRUNCATE "+testTable).Error)
	im.verifyOnly = true
	imported, err = im.importDay(ctx, day)
	require.NoError(t, err)
	assert.Equal(t, int64(0), imported)
	require.NoError(t, db.Table(testTable).Count(&count).Error)
	assert.Equal(t, int64(0), count)
	im.verifyOnly = false

	// 清单 sha256 不符：报错且不落库
	require.NoError(t, db.Model(&model.LogArchiveManifest{}).Where("day = ?", day).Update("sha256", "deadbeef").Error)
	_, err = im.importDay(ctx, day)
	require.ErrorContains(t, err, "sha256")
	require.NoError(t, db.Table(testTable).Count(&count).Error)
	assert.Equal(t, int64(0), count)

	// 没有清单的天 / pending 的天都不导
	_, err = im.importDay(ctx, "2026-03-11")
	require.ErrorIs(t, err, errManifestMissing)
	require.NoError(t, db.Create(&model.LogArchiveManifest{Day: "2026-03-11", Status: model.LogArchiveStatusPending, Parts: 1, TotalRows: 1}).Error)
	_, err = im.importDay(ctx, "2026-03-11")
	require.ErrorContains(t, err, "pending")
}

func TestResolveDays(t *testing.T) {
	days, err := resolveDays("", "2026-03-30", "2026-04-02")
	require.NoError(t, err)
	assert.Equal(t, []string{"2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"}, days)
	single, err := resolveDays("2026-03-10", "", "")
	require.NoError(t, err)
	assert.Equal(t, []string{"2026-03-10"}, single)
	_, err = resolveDays("", "2026-04-02", "2026-03-30")
	require.Error(t, err, "起止颠倒")
	_, err = resolveDays("", "", "")
	require.Error(t, err)
}
