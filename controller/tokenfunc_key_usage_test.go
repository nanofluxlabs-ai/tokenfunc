package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newKeyUsageRouter 与 router/tokenfunc-key-usage-router.go、/api/usage/token 同形：只经过 key 只读鉴权
func newKeyUsageRouter() *gin.Engine {
	engine := gin.New()
	engine.GET("/api/key-usage/logs", middleware.TokenAuthReadOnly(), GetKeyUsageLogs)
	engine.GET("/api/usage/token/", middleware.TokenAuthReadOnly(), GetTokenUsage)
	return engine
}

func keyUsageRequest(t *testing.T, router http.Handler, path string, key string) (int, map[string]any) {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.Header.Set("Authorization", "Bearer sk-"+key)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	body := map[string]any{}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body), response.Body.String())
	return response.Code, body
}

func TestKeyUsageEndpoints(t *testing.T) {
	setupCreditBillingPostgres(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Log{}))
	t.Cleanup(func() { require.NoError(t, model.DB.Migrator().DropTable(&model.Log{})) })
	router := newKeyUsageRouter()

	t.Run("logs are paged and filtered by time and model for this key only", func(t *testing.T) {
		user := newCreditBillingUser(t, "key-usage-owner", 1000, 0)
		token := newCreditBillingKey(t, user, nil, "keyusagelogskey", 0, 0)
		other := newCreditBillingKey(t, user, nil, "keyusageotherkey", 0, 0)
		now := common.GetTimestamp()
		// 按时间先后写入（与线上一致，列表按 id 倒序即最新在前）
		logs := []*model.Log{
			{UserId: user.Id, TokenId: token.Id, Type: model.LogTypeConsume, ModelName: "gpt-a", Quota: 40, CreatedAt: now - 3*24*3600},
			{UserId: user.Id, TokenId: token.Id, Type: model.LogTypeConsume, ModelName: "glm-b", Quota: 30, CreatedAt: now - 30},
			{UserId: user.Id, TokenId: token.Id, Type: model.LogTypeConsume, ModelName: "gpt-a", Quota: 20, CreatedAt: now - 20},
			{UserId: user.Id, TokenId: token.Id, Type: model.LogTypeConsume, ModelName: "gpt-a", Quota: 10, CreatedAt: now - 10},
			// 错误记录与其他 key 的记录都不该出现
			{UserId: user.Id, TokenId: token.Id, Type: model.LogTypeError, ModelName: "gpt-a", CreatedAt: now - 5},
			{UserId: user.Id, TokenId: other.Id, Type: model.LogTypeConsume, ModelName: "gpt-a", Quota: 50, CreatedAt: now - 5},
		}
		require.NoError(t, model.LOG_DB.Create(&logs).Error)

		status, body := keyUsageRequest(t, router, "/api/key-usage/logs?p=1&page_size=2", "keyusagelogskey")
		require.Equal(t, http.StatusOK, status, body)
		data := body["data"].(map[string]any)
		assert.EqualValues(t, 4, data["total"])
		items := data["items"].([]any)
		require.Len(t, items, 2)
		assert.EqualValues(t, 10, items[0].(map[string]any)["quota"])

		status, body = keyUsageRequest(t, router, "/api/key-usage/logs?p=2&page_size=2", "keyusagelogskey")
		require.Equal(t, http.StatusOK, status, body)
		items = body["data"].(map[string]any)["items"].([]any)
		require.Len(t, items, 2)
		assert.EqualValues(t, 30, items[0].(map[string]any)["quota"])

		path := "/api/key-usage/logs?model_name=gpt-a&start_timestamp=" + common.Interface2String(now-24*3600)
		status, body = keyUsageRequest(t, router, path, "keyusagelogskey")
		require.Equal(t, http.StatusOK, status, body)
		data = body["data"].(map[string]any)
		assert.EqualValues(t, 2, data["total"])

		status, _ = keyUsageRequest(t, router, "/api/key-usage/logs", "keyusagenosuchkey")
		assert.Equal(t, http.StatusUnauthorized, status)
	})

	t.Run("assigned enterprise keys never expose the wallet balance", func(t *testing.T) {
		plainUser := newCreditBillingUser(t, "key-usage-plain", 500, 5)
		plain := newCreditBillingKey(t, plainUser, nil, "keyusageplainkey", 0, 0)
		require.NoError(t, model.DB.Model(plain).Update("allow_user_quota_query", true).Error)
		status, body := keyUsageRequest(t, router, "/api/usage/token/", "keyusageplainkey")
		require.Equal(t, http.StatusOK, status, body)
		assert.Contains(t, body["data"].(map[string]any), "user_quota")

		owner, enterprise := newCreditBillingEnterprise(t, "key-usage-ent", model.EnterpriseBillingModePrepaid)
		member := &model.EnterpriseMember{EnterpriseId: enterprise.Id, Name: "Alice"}
		require.NoError(t, model.CreateEnterpriseMember(member))
		for key, memberId := range map[string]int{"keyusageteamkey": 0, "keyusagememberkey": member.Id} {
			token := newCreditBillingKey(t, owner, enterprise, key, 0, memberId)
			require.NoError(t, model.DB.Model(token).Update("allow_user_quota_query", true).Error)
			status, body = keyUsageRequest(t, router, "/api/usage/token/", key)
			require.Equal(t, http.StatusOK, status, body)
			assert.NotContains(t, body["data"].(map[string]any), "user_quota", key)
		}
	})
}
