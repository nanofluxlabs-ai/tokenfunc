package controller

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/objectstore"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// financeMemoryStore 内存对象存储替身（controller 侧只需最小读写能力）
type financeMemoryStore struct {
	mu      sync.Mutex
	objects map[string][]byte
}

func (m *financeMemoryStore) Key(parts ...string) string { return "test/" + strings.Join(parts, "/") }

func (m *financeMemoryStore) Put(_ context.Context, key string, body io.ReadSeeker, size int64, _ string, _ map[string]string) (string, error) {
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
	defer m.mu.Unlock()
	m.objects[key] = data
	return "not-an-md5", nil
}

func (m *financeMemoryStore) Head(_ context.Context, key string) (objectstore.ObjectInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.objects[key]
	if !ok {
		return objectstore.ObjectInfo{}, errors.New("not found")
	}
	return objectstore.ObjectInfo{Size: int64(len(data)), ETag: "not-an-md5"}, nil
}

func (m *financeMemoryStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.objects[key]
	if !ok {
		return nil, errors.New("not found")
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

// 财务中心用量接口只支持 PostgreSQL（二开约定），测试跑在真实 PG 上，未配置 DSN 时跳过
func setupFinanceBillArchivePostgres(t *testing.T) *financeMemoryStore {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, i18n.Init())
	tables := []any{&model.User{}, &model.Log{}, &model.Option{}, &model.Enterprise{}, &model.EnterpriseBill{}, &model.LogArchiveManifest{}}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousRedis := common.RedisEnabled
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.RedisEnabled = false
	model.InitColumnNames()
	store := &financeMemoryStore{objects: map[string][]byte{}}
	restoreStore := service.SetLogArchiveStoreForTest(store)
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.RedisEnabled = previousRedis
		restoreStore()
		model.InitColumnNames()
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
	return store
}

func financeUsageRequest(router http.Handler, path string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	return recorder
}

func decodeFinanceJSON(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body), recorder.Body.String())
	return body
}

// 已归档账单的账期 logs 被清理后：带 bill_id 的管理员用量接口改读冻结件，明细可翻页、导出与对象一致；
// 旧归档没有 JSON 件时回落实时 logs；他人账单 404
func TestAdminFinanceUsageReadsArchivedStatementAfterLogsPurged(t *testing.T) {
	store := setupFinanceBillArchivePostgres(t)
	loc := model.BillingLocation()
	owner := &model.User{Username: "archive-owner", Password: "placeholder", DisplayName: "archive-owner", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Email: "owner@example.com", AffCode: "arch-own"}
	require.NoError(t, model.DB.Create(owner).Error)
	other := &model.User{Username: "other-owner", Password: "placeholder", DisplayName: "other-owner", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "arch-oth"}
	require.NoError(t, model.DB.Create(other).Error)
	enterprise := &model.Enterprise{UserId: owner.Id, Name: "Archive Co", BillingMode: model.EnterpriseBillingModeCredit, Status: model.EnterpriseStatusActive}
	require.NoError(t, model.DB.Create(enterprise).Error)
	periodStart, periodEnd := time.Date(2026, 3, 10, 0, 0, 0, 0, loc), time.Date(2026, 3, 12, 0, 0, 0, 0, loc)
	for i := range 3 {
		require.NoError(t, model.LOG_DB.Create(&model.Log{UserId: owner.Id, Username: owner.Username, Type: model.LogTypeConsume, ModelName: "gpt-4o", Group: "default",
			Quota: 100 * (i + 1), PromptTokens: 10, CompletionTokens: 5, CreatedAt: periodStart.Add(time.Duration(i) * 12 * time.Hour).Unix(), Other: `{"a":1}`}).Error)
	}
	now := common.GetTimestamp()
	bill := &model.EnterpriseBill{BillNo: "B-ARCH-0001", EnterpriseId: enterprise.Id, BillType: model.EnterpriseBillTypeCredit, Status: model.EnterpriseBillUnpaid,
		PeriodStart: periodStart.Unix(), PeriodEnd: periodEnd.Unix(), AmountQuota: 600, Currency: "USD", IssuedAt: now, CreatedAt: now, UpdatedAt: now}
	require.NoError(t, model.DB.Create(bill).Error)
	info, err := service.ArchiveBill(context.Background(), bill)
	require.NoError(t, err)
	require.NotNil(t, info.StatementJSON)

	router := gin.New()
	router.GET("/usage/summary", AdminGetFinanceUsageSummary)
	router.GET("/usage/detail", AdminListFinanceUsageDetail)
	router.GET("/usage/export", AdminExportFinanceUsage)
	router.GET("/bills/:kind/:id", AdminGetFinanceBill)
	// 企业控制台同一主体：不带 user_id，按上下文里的企业主账号取数；用内联中间件代替 EnterpriseAuth 注入企业
	otherEnterprise := &model.Enterprise{UserId: other.Id, Name: "Other Co", BillingMode: model.EnterpriseBillingModeCredit, Status: model.EnterpriseStatusActive}
	require.NoError(t, model.DB.Create(otherEnterprise).Error)
	enterpriseRoute := router.Group("/enterprise", func(c *gin.Context) { c.Set(middleware.ContextKeyEnterprise, enterprise) })
	enterpriseRoute.GET("/finance/usage/summary", GetEnterpriseFinanceUsageSummary)
	enterpriseRoute.GET("/finance/usage/detail", ListEnterpriseFinanceUsageDetail)
	otherRoute := router.Group("/other-enterprise", func(c *gin.Context) { c.Set(middleware.ContextKeyEnterprise, otherEnterprise) })
	otherRoute.GET("/finance/usage/detail", ListEnterpriseFinanceUsageDetail)
	rangeQuery := "ts_start=" + strconv.FormatInt(periodStart.Unix(), 10) + "&ts_end=" + strconv.FormatInt(periodEnd.Unix()-1, 10)
	base := "?user_id=" + strconv.Itoa(owner.Id) + "&bill_id=" + strconv.FormatInt(bill.Id, 10) + "&" + rangeQuery
	enterpriseBase := "?bill_id=" + strconv.FormatInt(bill.Id, 10) + "&" + rangeQuery

	// logs 未清理：照旧走实时，不带 source
	body := decodeFinanceJSON(t, financeUsageRequest(router, "/usage/detail"+base+"&p=1&page_size=20"))
	assert.Equal(t, float64(3), body["data"].(map[string]any)["total"])
	assert.NotContains(t, body["data"].(map[string]any), "source")
	// 企业侧不带 bill_id：按企业主账号实时聚合
	enterpriseLive := decodeFinanceJSON(t, financeUsageRequest(router, "/enterprise/finance/usage/summary?"+rangeQuery))["data"].(map[string]any)
	assert.Equal(t, float64(3), enterpriseLive["total_calls"])
	assert.Equal(t, float64(600), enterpriseLive["total_quota"])
	assert.NotContains(t, enterpriseLive, "source")
	context, err := model.GetFinanceBillContext(model.FinanceBillKindBill, bill.Id)
	require.NoError(t, err)
	assert.Equal(t, model.FinanceUsageSourceLive, context.UsageSource)

	// 模拟 90 天清理：账期内一天登记为已清理，并删掉该用户账期内全部 logs
	require.NoError(t, model.DB.Create(&model.LogArchiveManifest{Day: "2026-03-10", Status: model.LogArchiveStatusPurged, CreatedAt: now, UpdatedAt: now}).Error)
	require.NoError(t, model.LOG_DB.Where("user_id = ?", owner.Id).Delete(&model.Log{}).Error)
	context, err = model.GetFinanceBillContext(model.FinanceBillKindBill, bill.Id)
	require.NoError(t, err)
	assert.True(t, context.LogsPurged)
	assert.Equal(t, model.FinanceUsageSourceArchive, context.UsageSource)

	// 明细：从冻结件分页，时间倒序，total 与登记一致
	page1 := decodeFinanceJSON(t, financeUsageRequest(router, "/usage/detail"+base+"&p=1&page_size=2"))["data"].(map[string]any)
	assert.Equal(t, model.FinanceUsageSourceArchive, page1["source"])
	assert.Equal(t, float64(info.StatementJSON.Rows), page1["total"])
	require.Len(t, page1["items"], 2)
	assert.Equal(t, float64(300), page1["items"].([]any)[0].(map[string]any)["quota"])
	page2 := decodeFinanceJSON(t, financeUsageRequest(router, "/usage/detail"+base+"&p=2&page_size=2"))["data"].(map[string]any)
	require.Len(t, page2["items"], 1)
	assert.Equal(t, float64(100), page2["items"].([]any)[0].(map[string]any)["quota"])
	page3 := decodeFinanceJSON(t, financeUsageRequest(router, "/usage/detail"+base+"&p=3&page_size=2"))["data"].(map[string]any)
	assert.Empty(t, page3["items"])

	// 企业侧带 bill_id：同样读冻结件，total 与管理员路径一致；别家企业借这张 bill_id 一律 404
	enterprisePage := decodeFinanceJSON(t, financeUsageRequest(router, "/enterprise/finance/usage/detail"+enterpriseBase+"&p=1&page_size=2"))["data"].(map[string]any)
	assert.Equal(t, model.FinanceUsageSourceArchive, enterprisePage["source"])
	assert.Equal(t, page1["total"], enterprisePage["total"])
	require.Len(t, enterprisePage["items"], 2)
	assert.Equal(t, http.StatusNotFound, financeUsageRequest(router, "/other-enterprise/finance/usage/detail"+enterpriseBase+"&p=1&page_size=2").Code)

	// 汇总：来自冻结件，账期按账单
	summary := decodeFinanceJSON(t, financeUsageRequest(router, "/usage/summary"+base))["data"].(map[string]any)
	assert.Equal(t, model.FinanceUsageSourceArchive, summary["source"])
	assert.Equal(t, float64(3), summary["total_calls"])
	assert.Equal(t, float64(600), summary["total_quota"])
	assert.Equal(t, "2026-03-11", summary["period"].(map[string]any)["end"])

	// 导出：与对象存储里的 statement.csv.gz 解压后逐字节一致
	export := financeUsageRequest(router, "/usage/export"+base)
	require.Equal(t, http.StatusOK, export.Code)
	assert.Contains(t, export.Header().Get("Content-Type"), "text/csv")
	gz, err := gzip.NewReader(bytes.NewReader(store.objects[info.Statement.Key]))
	require.NoError(t, err)
	frozen, err := io.ReadAll(gz)
	require.NoError(t, err)
	assert.Equal(t, string(frozen), export.Body.String())
	assert.Contains(t, export.Body.String(), "调用明细")
	noDetail := financeUsageRequest(router, "/usage/export"+base+"&include_detail=false")
	require.Equal(t, http.StatusOK, noDetail.Code)
	assert.Contains(t, noDetail.Body.String(), "汇总(按天)")
	assert.NotContains(t, noDetail.Body.String(), "调用明细")

	// 账单详情接口透出 usage_source
	detail := decodeFinanceJSON(t, financeUsageRequest(router, "/bills/bill/"+strconv.FormatInt(bill.Id, 10)))["data"].(map[string]any)
	assert.Equal(t, model.FinanceUsageSourceArchive, detail["usage_source"])

	// 他人 user_id 配这张账单：404
	assert.Equal(t, http.StatusNotFound, financeUsageRequest(router, "/usage/detail?user_id="+strconv.Itoa(other.Id)+"&bill_id="+strconv.FormatInt(bill.Id, 10)+"&ts_start=1&ts_end=2").Code)

	// 旧归档（v1，没有 JSON 件）：回落实时 logs（已删，为 0）并提示不可用
	legacy := info
	legacy.StatementJSON, legacy.SchemaVersion = nil, 1
	require.NoError(t, model.MarkBillArchived(bill.Id, legacy))
	fallback := decodeFinanceJSON(t, financeUsageRequest(router, "/usage/detail"+base+"&p=1&page_size=20"))["data"].(map[string]any)
	assert.Equal(t, float64(0), fallback["total"])
	assert.NotContains(t, fallback, "source")
	context, err = model.GetFinanceBillContext(model.FinanceBillKindBill, bill.Id)
	require.NoError(t, err)
	assert.Equal(t, model.FinanceUsageSourceArchiveUnavailable, context.UsageSource)
}
