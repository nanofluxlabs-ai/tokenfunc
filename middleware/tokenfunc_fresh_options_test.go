package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 另一个副本写库后本副本内存还是旧值：挂了 FreshOptions 的接口必须返回库里的新值。
func TestFreshOptionsServesOptionWrittenByAnotherReplica(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	previousDB := model.DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(&model.Option{}))
		require.NoError(t, sqlDB.Close())
		model.DB = previousDB
		common.SetDatabaseTypes(previousMain, previousLog)
	})
	require.NoError(t, db.Migrator().DropTable(&model.Option{}))
	require.NoError(t, db.AutoMigrate(&model.Option{}))

	const key = "SystemName"
	// 模拟别的副本已经把新值提交进库，而本副本内存还停在旧值
	require.NoError(t, db.Create(&model.Option{Key: key, Value: "written-by-other-replica"}).Error)
	common.OptionMapRWMutex.Lock()
	common.OptionMap[key] = "stale-in-this-replica"
	common.OptionMapRWMutex.Unlock()

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	readOption := func(c *gin.Context) {
		common.OptionMapRWMutex.RLock()
		defer common.OptionMapRWMutex.RUnlock()
		c.String(http.StatusOK, common.OptionMap[key])
	}
	engine.GET("/stale", readOption)
	engine.GET("/fresh", FreshOptions(), readOption)

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/stale", nil))
	assert.Equal(t, "stale-in-this-replica", recorder.Body.String(), "不挂中间件时读到的是本副本旧内存")

	recorder = httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/fresh", nil))
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "written-by-other-replica", recorder.Body.String())
}
