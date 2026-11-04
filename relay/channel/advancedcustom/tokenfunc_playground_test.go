package advancedcustom

import (
	"net/http"
	"testing"

	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Chat 请求被 chat→responses 策略转成 Responses 后，要按 /v1/responses 匹配路由，而不是客户端原始的 chat 路径
func TestAdaptorConvertedResponsesRequestMatchesResponsesRoute(t *testing.T) {
	info := advancedCustomRelayInfo(&dto.AdvancedCustomConfig{
		Routes: []dto.AdvancedCustomRoute{
			{IncomingPath: "/v1/chat/completions", UpstreamPath: "/upstream/chat"},
			{IncomingPath: "/v1/responses", UpstreamPath: "/upstream/responses"},
		},
	})
	// 与 relayResponsesRequest 的做法一致：只改 RelayMode 与 RequestURLPath，客户端原始路径不变
	info.RelayMode = relayconstant.RelayModeResponses
	info.RequestURLPath = "/v1/responses"
	c := advancedCustomGinContext("/v1/chat/completions")

	adaptor := &Adaptor{}
	header := http.Header{}
	require.NoError(t, adaptor.SetupRequestHeader(c, &header, info))
	requestURL, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://fallback.example/upstream/responses", requestURL)
}

// 没有被转换的 chat 请求仍按客户端原始路径匹配
func TestAdaptorPlainChatRequestKeepsChatRoute(t *testing.T) {
	info := advancedCustomRelayInfo(&dto.AdvancedCustomConfig{
		Routes: []dto.AdvancedCustomRoute{
			{IncomingPath: "/v1/chat/completions", UpstreamPath: "/upstream/chat"},
			{IncomingPath: "/v1/responses", UpstreamPath: "/upstream/responses"},
		},
	})
	c := advancedCustomGinContext("/v1/chat/completions")

	adaptor := &Adaptor{}
	header := http.Header{}
	require.NoError(t, adaptor.SetupRequestHeader(c, &header, info))
	requestURL, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://fallback.example/upstream/chat", requestURL)
}

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
