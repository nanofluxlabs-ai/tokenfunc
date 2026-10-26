package controller

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLogSummaryMatchesListFiltersAndCacheSemantics(t *testing.T) {
	setupPromoterControllerPostgres(t)
	now := time.Now().Unix()
	logs := []model.Log{
		// openai 语义：prompt 已含缓存 400
		{UserId: 1, Username: "alice", Type: model.LogTypeConsume, CreatedAt: now - 10, Quota: 500, PromptTokens: 1000, CompletionTokens: 200, RequestId: "r1", Other: `{"cache_tokens":400}`},
		// anthropic 语义：prompt 不含缓存读 600 / 写 100
		{UserId: 1, Username: "alice", Type: model.LogTypeConsume, CreatedAt: now - 10, Quota: 700, PromptTokens: 300, CompletionTokens: 100, RequestId: "r2", Other: `{"cache_tokens":600,"cache_creation_tokens":100,"usage_semantic":"anthropic"}`},
		{UserId: 1, Username: "alice", Type: model.LogTypeRefund, CreatedAt: now - 10, Quota: 200, RequestId: "r3"},
		{UserId: 1, Username: "alice", Type: model.LogTypeError, CreatedAt: now - 10, RequestId: "r4"},
		{UserId: 2, Username: "bob", Type: model.LogTypeConsume, CreatedAt: now - 10, Quota: 1000, PromptTokens: 50, RequestId: "r5"},
		// 区间外
		{UserId: 1, Username: "alice", Type: model.LogTypeConsume, CreatedAt: now - 7200, Quota: 9999, PromptTokens: 9999, RequestId: "r6"},
	}
	require.NoError(t, model.LOG_DB.Create(&logs).Error)

	engine := gin.New()
	as := func(id int, role int) gin.HandlerFunc {
		return func(c *gin.Context) {
			c.Set("id", id)
			c.Set("role", role)
			c.Next()
		}
	}
	engine.GET("/admin", as(9, common.RoleAdminUser), GetLogsSummary)
	engine.GET("/self", as(1, common.RoleCommonUser), GetLogsSelfSummary)
	start := now - 3600

	type summary struct {
		Requests, NetQuota, RefundQuota, InputTokensTotal, CacheReadTokens, CacheWriteTokens, ErrorCount, Rpm int64
	}
	read := func(path string) summary {
		rec, payload := doPromoterRequest(t, engine, http.MethodGet, path, "")
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, true, payload["success"], payload["message"])
		data := payload["data"].(map[string]any)
		num := func(key string) int64 { return int64(data[key].(float64)) }
		assert.Contains(t, data, "error_log_enabled")
		return summary{num("requests"), num("net_quota"), num("refund_quota"), num("input_tokens_total"), num("cache_read_tokens"), num("cache_write_tokens"), num("error_count"), num("rpm")}
	}

	// 列表的 type 筛选不影响统计
	assert.Equal(t, summary{3, 2000, 200, 2050, 1000, 100, 1, 3}, read(fmt.Sprintf("/admin?start_timestamp=%d&type=5", start)))
	assert.Equal(t, summary{1, 700, 0, 1000, 600, 100, 0, 1}, read(fmt.Sprintf("/admin?start_timestamp=%d&request_id=r2", start)))
	assert.Equal(t, summary{2, 1000, 200, 2000, 1000, 100, 1, 2}, read(fmt.Sprintf("/self?start_timestamp=%d", start)))

	_, payload := doPromoterRequest(t, engine, http.MethodGet, "/self?start_timestamp=1", "")
	assert.Equal(t, false, payload["success"])
}
