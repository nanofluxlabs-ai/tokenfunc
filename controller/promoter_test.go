package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func setupPromoterControllerPostgres(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	tables := []any{&model.User{}, &model.Log{}, &model.Option{}, &model.Enterprise{}, &model.LogDailyRollup{}, &model.Promoter{}, &model.PromoterBinding{}}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	// 审计日志会走用户缓存，测试进程没有 Redis 连接
	previousRedis := common.RedisEnabled
	common.RedisEnabled = false
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	model.InitColumnNames()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.RedisEnabled = previousRedis
		model.InitColumnNames()
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
}

// newPromoterTestRouter 与 router/promoter-router.go 同形，登录态由 asUser 注入，鉴权中间件用真实实现
func newPromoterTestRouter(user *model.User) *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	asUser := func(c *gin.Context) {
		c.Set("id", user.Id)
		c.Set("role", user.Role)
		c.Set("username", user.Username)
		c.Next()
	}
	api := engine.Group("/api")
	api.GET("/promoter/self", asUser, GetPromoterSelf)
	center := api.Group("/promoter/center", asUser, middleware.PromoterAuth())
	center.GET("/overview", GetPromoterCenterOverview)
	admin := api.Group("/admin/promoter", asUser)
	admin.POST("/promoters", AdminCreatePromoter)
	one := admin.Group("/promoters/:id", middleware.PromoterFromParam())
	one.POST("/bindings", AdminBindPromoterUsers)
	one.GET("/center/overview", GetPromoterCenterOverview)
	return engine
}

func doPromoterRequest(t *testing.T, engine *gin.Engine, method string, path string, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	payload := map[string]any{}
	if rec.Body.Len() > 0 {
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &payload))
	}
	return rec, payload
}

func TestPromoterEndpointsAuthAndBindingContract(t *testing.T) {
	setupPromoterControllerPostgres(t)
	admin := &model.User{Username: "admin", Password: "password123", DisplayName: "admin", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AffCode: "adm"}
	plain := &model.User{Username: "plain", Password: "password123", DisplayName: "plain", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "pln"}
	promo := &model.User{Username: "promo", Password: "password123", DisplayName: "promo", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "prm"}
	for _, user := range []*model.User{admin, plain, promo} {
		require.NoError(t, model.DB.Create(user).Error)
	}

	// 非推广人：self 返回 null，推广中心 403
	rec, payload := doPromoterRequest(t, newPromoterTestRouter(plain), http.MethodGet, "/api/promoter/self", "")
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Nil(t, payload["data"])
	rec, _ = doPromoterRequest(t, newPromoterTestRouter(plain), http.MethodGet, "/api/promoter/center/overview", "")
	assert.Equal(t, http.StatusForbidden, rec.Code)

	// 管理员设推广人；对不存在的 id 404
	adminRouter := newPromoterTestRouter(admin)
	rec, payload = doPromoterRequest(t, adminRouter, http.MethodPost, "/api/admin/promoter/promoters", `{"user_id":`+common.Interface2String(promo.Id)+`,"remark":"r1"}`)
	assert.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, true, payload["success"], payload["message"])
	profile := payload["data"].(map[string]any)
	promoterId := int(profile["id"].(float64))
	assert.Equal(t, "prm", profile["aff_code"])
	rec, _ = doPromoterRequest(t, adminRouter, http.MethodGet, "/api/admin/promoter/promoters/99999/center/overview", "")
	assert.Equal(t, http.StatusNotFound, rec.Code)

	// 绑定返回 bound / failed 结构，失败项带可翻译的 reason_key
	rec, payload = doPromoterRequest(t, adminRouter, http.MethodPost, "/api/admin/promoter/promoters/"+common.Interface2String(promoterId)+"/bindings", `{"inputs":["plain","admin","nobody"],"include_history":true}`)
	assert.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, true, payload["success"], payload["message"])
	data := payload["data"].(map[string]any)
	bound := data["bound"].([]any)
	failed := data["failed"].([]any)
	require.Len(t, bound, 1)
	assert.Equal(t, "plain", bound[0].(map[string]any)["username"])
	require.Len(t, failed, 2)
	assert.Equal(t, "Admin accounts cannot be bound", failed[0].(map[string]any)["reason_key"])
	assert.Equal(t, "User does not exist or has been deleted", failed[1].(map[string]any)["reason_key"])
	binding, err := model.GetActiveBindingByUserId(plain.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(0), binding.UsageSince)

	// 推广人本人：self 有档案，推广中心 200 且名下 1 人；管理员视角同一 handler
	promoRouter := newPromoterTestRouter(promo)
	rec, payload = doPromoterRequest(t, promoRouter, http.MethodGet, "/api/promoter/self", "")
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "promo", payload["data"].(map[string]any)["username"])
	rec, payload = doPromoterRequest(t, promoRouter, http.MethodGet, "/api/promoter/center/overview?start=2026-03-01&end=2026-03-02", "")
	assert.Equal(t, http.StatusOK, rec.Code)
	summary := payload["data"].(map[string]any)["summary"].(map[string]any)
	assert.Equal(t, float64(1), summary["bound_user_count"])
	rec, payload = doPromoterRequest(t, adminRouter, http.MethodGet, "/api/admin/promoter/promoters/"+common.Interface2String(promoterId)+"/center/overview", "")
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, float64(1), payload["data"].(map[string]any)["summary"].(map[string]any)["bound_user_count"])

	// 业务错误带 message_key，供前端翻译
	rec, payload = doPromoterRequest(t, adminRouter, http.MethodPost, "/api/admin/promoter/promoters", `{"user_id":`+common.Interface2String(admin.Id)+`}`)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, false, payload["success"])
	assert.Equal(t, "Admin accounts cannot be promoters", payload["message_key"])
	_ = service.PromoterBatchBindMax
}
