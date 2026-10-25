package service

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func setupLogRollupPostgres(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	tables := []any{&model.User{}, &model.Log{}, &model.Option{}, &model.LogDailyRollup{}}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	model.InitColumnNames()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		model.InitColumnNames()
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
}

func countRollupRows(t *testing.T, day string) int64 {
	t.Helper()
	var count int64
	require.NoError(t, model.DB.Model(&model.LogDailyRollup{}).Where("day = ?", day).Count(&count).Error)
	return count
}

// 一轮补齐到昨天、今天不写；昨天只在之后的轮次重算一次；跨到新的一天后继续推进游标
func TestLogDailyRollupTaskAdvancesCursorAndRerollsYesterdayOnce(t *testing.T) {
	setupLogRollupPostgres(t)
	loc := model.BillingLocation()
	day := func(d int, hour int) int64 { return time.Date(2026, 3, 10+d, hour, 0, 0, 0, loc).Unix() }
	for d := range 4 { // 03-10 .. 03-13
		require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: 1, Username: "u1", Type: model.LogTypeConsume, ModelName: "gpt-4o", Group: "default", Quota: 100, PromptTokens: 10, CompletionTokens: 5, CreatedAt: day(d, 9)}).Error)
	}
	now := time.Date(2026, 3, 13, 10, 0, 0, 0, loc) // 今天 03-13，昨天 03-12
	ctx := context.Background()

	require.NoError(t, runLogDailyRollupOnce(ctx, now, 0))
	cursor, err := model.GetLogRollupCursor()
	require.NoError(t, err)
	assert.Equal(t, "2026-03-12", cursor)
	for _, d := range []string{"2026-03-10", "2026-03-11", "2026-03-12"} {
		assert.Equal(t, int64(1), countRollupRows(t, d), d)
	}
	assert.Equal(t, int64(0), countRollupRows(t, "2026-03-13"), "today must never be rolled")
	done, err := model.GetLogRollupYesterdayDone()
	require.NoError(t, err)
	assert.Equal(t, "", done, "the round that just rolled yesterday must not mark it done")

	// 第二轮：昨天补进一条迟到日志，重算一次并标记
	require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: 2, Username: "u2", Type: model.LogTypeConsume, ModelName: "gpt-4o", Group: "default", Quota: 50, CreatedAt: day(2, 23)}).Error)
	require.NoError(t, runLogDailyRollupOnce(ctx, now.Add(time.Hour), 0))
	assert.Equal(t, int64(2), countRollupRows(t, "2026-03-12"))
	done, err = model.GetLogRollupYesterdayDone()
	require.NoError(t, err)
	assert.Equal(t, "2026-03-12", done)

	// 第三轮：再有迟到日志也不重算
	require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: 3, Username: "u3", Type: model.LogTypeConsume, ModelName: "gpt-4o", Group: "default", Quota: 50, CreatedAt: day(2, 23)}).Error)
	require.NoError(t, runLogDailyRollupOnce(ctx, now.Add(2*time.Hour), 0))
	assert.Equal(t, int64(2), countRollupRows(t, "2026-03-12"))

	// 跨到 03-14：补 03-13，游标推进，昨天标记留给下一轮
	require.NoError(t, runLogDailyRollupOnce(ctx, now.AddDate(0, 0, 1), 0))
	cursor, err = model.GetLogRollupCursor()
	require.NoError(t, err)
	assert.Equal(t, "2026-03-13", cursor)
	assert.Equal(t, int64(1), countRollupRows(t, "2026-03-13"))
	done, err = model.GetLogRollupYesterdayDone()
	require.NoError(t, err)
	assert.Equal(t, "2026-03-12", done)
}

// 没有任何日志时不推进游标，也不报错
func TestLogDailyRollupTaskNoLogs(t *testing.T) {
	setupLogRollupPostgres(t)
	require.NoError(t, runLogDailyRollupOnce(context.Background(), time.Now(), 0))
	cursor, err := model.GetLogRollupCursor()
	require.NoError(t, err)
	assert.Equal(t, "", cursor)
}
