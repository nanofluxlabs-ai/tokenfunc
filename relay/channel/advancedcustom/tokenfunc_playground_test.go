package advancedcustom

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 游乐场请求 /pg/chat/completions 要按改写后的 /v1/chat/completions 匹配路由
func TestAdaptorPlaygroundRequestMatchesV1Route(t *testing.T) {
	info := advancedCustomRelayInfo(&dto.AdvancedCustomConfig{
		Routes: []dto.AdvancedCustomRoute{
			{IncomingPath: "/v1/chat/completions", UpstreamPath: "/v1/chat/completions"},
		},
	})
	info.IsPlayground = true
	c := advancedCustomGinContext("/pg/chat/completions")

	adaptor := &Adaptor{}
	header := http.Header{}
	require.NoError(t, adaptor.SetupRequestHeader(c, &header, info))
	requestURL, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://fallback.example/v1/chat/completions", requestURL)
}
