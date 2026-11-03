package service

import (
	"errors"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 外部渠道健康态只支持 PostgreSQL，测试跑在真实 PG 上
func setupChannelHealthPostgres(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	tables := []any{
		&model.User{}, &model.Channel{}, &model.Ability{}, &model.Option{},
		&model.ChannelHealthState{}, &model.ChannelHealthEvent{},
	}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousMemoryCache := common.MemoryCacheEnabled
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.MemoryCacheEnabled = previousMemoryCache
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
	root := &model.User{Username: "root", Password: "password123", DisplayName: "root", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AffCode: "root"}
	require.NoError(t, model.DB.Create(root).Error)
}

func newHealthTestChannel(t *testing.T, id int, external bool) *model.Channel {
	t.Helper()
	channel := &model.Channel{
		Id: id, Type: constant.ChannelTypeOpenAI, Key: "sk-test", Status: common.ChannelStatusEnabled,
		Name: "channel-" + string(rune('a'+id)), Models: "gpt-4o-mini", Group: "default", IsExternal: &external,
	}
	require.NoError(t, channel.Insert())
	return channel
}

// upstreamErr 模拟上游返回的错误（与 relay 错误处理里的类型一致）
func upstreamErr(statusCode int, message string) *types.NewAPIError {
	return types.WithOpenAIError(types.OpenAIError{Message: message, Type: "upstream_error"}, statusCode)
}

func eventKinds(t *testing.T, channelId int) []string {
	t.Helper()
	events, err := model.GetChannelHealthEvents(channelId, 50)
	require.NoError(t, err)
	kinds := make([]string, 0, len(events))
	for i := len(events) - 1; i >= 0; i-- {
		kinds = append(kinds, events[i].Kind)
	}
	return kinds
}

func TestChannelHealthApiProbePausesAfterThresholdAndRecoversAfterSuccesses(t *testing.T) {
	setupChannelHealthPostgres(t)
	channel := newHealthTestChannel(t, 1, true)

	for i := range 2 {
		transition, err := RecordChannelApiProbe(channel, ChannelHealthVerdictTransient, "HTTP 502")
		require.NoError(t, err, "failure %d", i)
		assert.False(t, transition.Paused)
	}
	state, err := model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, model.ChannelHealthUnknown, state.ApiHealth)
	assert.Equal(t, 2, state.ApiFailCount)
	assert.False(t, model.IsChannelDispatchPaused(channel.Id))

	transition, err := RecordChannelApiProbe(channel, ChannelHealthVerdictTransient, "HTTP 502")
	require.NoError(t, err)
	assert.True(t, transition.Paused)
	state, err = model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, model.ChannelHealthFailed, state.ApiHealth)
	assert.True(t, state.DispatchPaused)
	assert.Equal(t, "HTTP 502", state.LastApiError)
	assert.True(t, model.IsChannelDispatchPaused(channel.Id))

	// failed 态下连续成功达到恢复阈值（默认 2）才恢复
	transition, err = RecordChannelApiProbe(channel, ChannelHealthVerdictOK, "HTTP 200")
	require.NoError(t, err)
	assert.False(t, transition.Resumed)
	assert.True(t, model.IsChannelDispatchPaused(channel.Id))
	transition, err = RecordChannelApiProbe(channel, ChannelHealthVerdictOK, "HTTP 200")
	require.NoError(t, err)
	assert.True(t, transition.Resumed)
	state, err = model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, model.ChannelHealthOK, state.ApiHealth)
	assert.Equal(t, 0, state.ApiFailCount)
	assert.Equal(t, 0, state.ApiSuccessCount)
	assert.Empty(t, state.LastApiError)
	assert.False(t, model.IsChannelDispatchPaused(channel.Id))

	assert.Equal(t, []string{
		model.ChannelHealthEventProbeFailed, model.ChannelHealthEventProbeFailed,
		model.ChannelHealthEventDispatchPaused, model.ChannelHealthEventDispatchResumed,
	}, eventKinds(t, channel.Id))
}

func TestChannelHealthRelayFailuresPauseInferenceAndOneSuccessResumes(t *testing.T) {
	setupChannelHealthPostgres(t)
	channel := newHealthTestChannel(t, 2, true)

	// 限流不计数
	RecordExternalChannelRelayFailure(channel, upstreamErr(429, "rate limited"))
	state, err := model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, 0, state.InferenceFailCount)

	RecordExternalChannelRelayFailure(channel, upstreamErr(502, "bad gateway"))
	RecordExternalChannelRelayFailure(channel, upstreamErr(503, "unavailable"))
	state, err = model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, model.ChannelHealthFailed, state.InferenceHealth)
	assert.Equal(t, model.ChannelHealthUnknown, state.ApiHealth)
	assert.True(t, model.IsChannelDispatchPaused(channel.Id))

	// relay 一次成功直接恢复，不受恢复阈值约束
	RecordExternalChannelRelaySuccess(channel)
	state, err = model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, model.ChannelHealthOK, state.InferenceHealth)
	assert.Equal(t, 0, state.InferenceFailCount)
	assert.False(t, model.IsChannelDispatchPaused(channel.Id))
	assert.Equal(t, []string{
		model.ChannelHealthEventRelayFailed, model.ChannelHealthEventDispatchPaused, model.ChannelHealthEventDispatchResumed,
	}, eventKinds(t, channel.Id))
}

// relay 首次尝试拿到的 channel 只有 Id / Type / Name（与 controller.getChannel 一致），钩子须按 Id 识别外部渠道；
// 中间的成功要清零计数，否则相隔很久的两次 5xx 也会暂停派发
func TestChannelHealthRelaySuccessClearsFailuresForBareChannel(t *testing.T) {
	setupChannelHealthPostgres(t)
	channel := newHealthTestChannel(t, 3, true)
	bare := &model.Channel{Id: channel.Id, Type: channel.Type, Name: channel.Name}

	// 与生产一致：失败路径（ProcessChannelError）传缓存里的完整渠道，成功路径传 relay 循环里的精简渠道
	RecordExternalChannelRelayFailure(channel, upstreamErr(503, "upstream unavailable"))
	RecordExternalChannelRelaySuccess(bare)
	RecordExternalChannelRelayFailure(channel, upstreamErr(502, "bad gateway"))

	state, err := model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, 1, state.InferenceFailCount)
	assert.NotEqual(t, model.ChannelHealthFailed, state.InferenceHealth)
	assert.False(t, model.IsChannelDispatchPaused(channel.Id))

	// 重启或其他实例写入后：待清除集合从库重建，relay 成功仍能清零
	require.NoError(t, model.DB.Model(&model.ChannelHealthState{}).Where("channel_id = ?", channel.Id).Update("inference_fail_count", 1).Error)
	model.ReloadChannelHealthStates()
	RecordExternalChannelRelaySuccess(bare)
	state, err = model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, 0, state.InferenceFailCount)
	assert.False(t, model.IsChannelInferencePending(channel.Id))
}

// 只按标准状态码与错误类型判定：429 与真实流量 4xx、网关自身错误不计入；401、余额耗尽立即暂停；探测的 4xx 按渠道不可用处理。
// 上游把内容安全、限流包成 500 的按临时故障计数（不解析错误文本）
func TestClassifyChannelHealthFailure(t *testing.T) {
	cases := []struct {
		name   string
		err    *types.NewAPIError
		source ChannelHealthFailureSource
		want   ChannelHealthVerdict
	}{
		{"成功", nil, ChannelHealthFailureFromRelay, ChannelHealthVerdictOK},
		{"网关自身错误", types.NewError(errors.New("count token failed"), types.ErrorCodeCountTokenFailed), ChannelHealthFailureFromRelay, ChannelHealthVerdictIgnore},
		{"传输失败", types.NewError(errors.New("dial tcp: connection refused"), types.ErrorCodeDoRequestFailed), ChannelHealthFailureFromRelay, ChannelHealthVerdictTransient},
		{"渠道密钥不可用", types.NewError(errors.New("no available key"), types.ErrorCodeChannelNoAvailableKey), ChannelHealthFailureFromRelay, ChannelHealthVerdictPermanent},
		{"内容安全包成 500 按状态码计临时故障", upstreamErr(500, "[1301][系统检测到输入或生成内容可能包含不安全或敏感内容]"), ChannelHealthFailureFromRelay, ChannelHealthVerdictTransient},
		{"并发限流包成 500 按状态码计临时故障", upstreamErr(500, "Concurrency limit exceeded for user, please retry later"), ChannelHealthFailureFromRelay, ChannelHealthVerdictTransient},
		{"429 限流", upstreamErr(429, "Rate limit reached for requests"), ChannelHealthFailureFromRelay, ChannelHealthVerdictIgnore},
		{"429 额度耗尽", upstreamErr(429, "You exceeded your current quota, please check your plan and billing details."), ChannelHealthFailureFromRelay, ChannelHealthVerdictPermanent},
		{"401 密钥失效", upstreamErr(401, "Incorrect API key provided"), ChannelHealthFailureFromRelay, ChannelHealthVerdictPermanent},
		{"403 余额不足", upstreamErr(403, "Your credit balance is too low to access the API"), ChannelHealthFailureFromRelay, ChannelHealthVerdictPermanent},
		{"503 上游不可用", upstreamErr(503, "Service temporarily unavailable"), ChannelHealthFailureFromRelay, ChannelHealthVerdictTransient},
		{"504 网关超时", upstreamErr(504, "gateway timeout"), ChannelHealthFailureFromProbe, ChannelHealthVerdictTransient},
		{"真实流量 400", upstreamErr(400, "messages: invalid role"), ChannelHealthFailureFromRelay, ChannelHealthVerdictIgnore},
		{"真实流量 404", upstreamErr(404, "model not found"), ChannelHealthFailureFromRelay, ChannelHealthVerdictIgnore},
		{"探测 400", upstreamErr(400, "unsupported model"), ChannelHealthFailureFromProbe, ChannelHealthVerdictTransient},
		{"探测 404", upstreamErr(404, "no available accounts supporting model"), ChannelHealthFailureFromProbe, ChannelHealthVerdictTransient},
		{"探测 429", upstreamErr(429, "too many requests"), ChannelHealthFailureFromProbe, ChannelHealthVerdictIgnore},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, ClassifyChannelHealthFailure(tc.err, tc.source))
		})
	}

	apiCases := map[int]ChannelHealthVerdict{
		200: ChannelHealthVerdictOK, 204: ChannelHealthVerdictOK,
		401: ChannelHealthVerdictPermanent,
		403: ChannelHealthVerdictTransient, 408: ChannelHealthVerdictTransient, 502: ChannelHealthVerdictTransient,
		404: ChannelHealthVerdictIgnore, 429: ChannelHealthVerdictIgnore, 400: ChannelHealthVerdictIgnore,
	}
	for status, want := range apiCases {
		assert.Equal(t, want, ClassifyChannelApiProbeStatus(status), "status %d", status)
	}
}

// 永久故障不等阈值，一次即暂停；忽略类结果不碰状态、不写事件
func TestChannelHealthPermanentFailurePausesImmediatelyAndIgnoredLeavesStateUntouched(t *testing.T) {
	setupChannelHealthPostgres(t)
	channel := newHealthTestChannel(t, 7, true)

	RecordExternalChannelRelayFailure(channel, upstreamErr(429, "rate limited"))
	RecordExternalChannelRelayFailure(channel, upstreamErr(400, "invalid request"))
	_, err := RecordChannelInferenceProbe(channel, ChannelHealthVerdictIgnore, "rate limited")
	require.NoError(t, err)
	states, err := model.GetChannelHealthStates([]int{channel.Id})
	require.NoError(t, err)
	assert.Empty(t, states, "忽略类结果不落库")
	assert.Empty(t, eventKinds(t, channel.Id))

	RecordExternalChannelRelayFailure(channel, upstreamErr(401, "Incorrect API key provided"))
	assert.True(t, model.IsChannelDispatchPaused(channel.Id))
	state, err := model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, model.ChannelHealthFailed, state.InferenceHealth)
	assert.Equal(t, []string{model.ChannelHealthEventDispatchPaused}, eventKinds(t, channel.Id))

	// 接口探测的永久故障同样立即暂停
	other := newHealthTestChannel(t, 8, true)
	transition, err := RecordChannelApiProbe(other, ChannelHealthVerdictPermanent, "HTTP 401")
	require.NoError(t, err)
	assert.True(t, transition.Paused)
}

func TestChannelHealthSlowProbeRecoverThresholdAndManualTestShortcut(t *testing.T) {
	setupChannelHealthPostgres(t)
	channel := newHealthTestChannel(t, 3, true)

	for range 2 {
		_, err := RecordChannelInferenceProbe(channel, ChannelHealthVerdictTransient, "timeout")
		require.NoError(t, err)
	}
	assert.True(t, model.IsChannelDispatchPaused(channel.Id))

	// 慢探恢复阈值默认 1：一次成功即恢复
	transition, err := RecordChannelInferenceProbe(channel, ChannelHealthVerdictOK, "")
	require.NoError(t, err)
	assert.True(t, transition.Resumed)

	for range 2 {
		_, err := RecordChannelInferenceProbe(channel, ChannelHealthVerdictTransient, "timeout")
		require.NoError(t, err)
	}
	assert.True(t, model.IsChannelDispatchPaused(channel.Id))
	// 手动测试成功也直接恢复
	RecordChannelManualTestSuccess(channel)
	assert.False(t, model.IsChannelDispatchPaused(channel.Id))
}

func TestChannelHealthIgnoresNonExternalChannels(t *testing.T) {
	setupChannelHealthPostgres(t)
	channel := newHealthTestChannel(t, 4, false)

	for range 5 {
		transition, err := RecordChannelApiProbe(channel, ChannelHealthVerdictTransient, "HTTP 500")
		require.NoError(t, err)
		assert.False(t, transition.Paused)
	}
	RecordExternalChannelRelayFailure(channel, upstreamErr(500, "boom"))
	states, err := model.GetChannelHealthStates([]int{channel.Id})
	require.NoError(t, err)
	assert.Empty(t, states)
	assert.False(t, model.IsChannelDispatchPaused(channel.Id))
	assert.Empty(t, eventKinds(t, channel.Id))
}

// DB 分发路径（GetChannel）的门在 model 包测试里覆盖（需要 initCol）
func TestChannelHealthDispatchGateSkipsPausedChannelInMemoryCache(t *testing.T) {
	setupChannelHealthPostgres(t)
	paused := newHealthTestChannel(t, 5, true)
	healthy := newHealthTestChannel(t, 6, true)
	for range 3 {
		_, err := RecordChannelApiProbe(paused, ChannelHealthVerdictTransient, "HTTP 500")
		require.NoError(t, err)
	}
	require.True(t, model.IsChannelDispatchPaused(paused.Id))

	// 内存缓存分发路径：集合随 InitChannelCache 重建
	common.MemoryCacheEnabled = true
	model.InitChannelCache()
	t.Cleanup(func() { common.MemoryCacheEnabled = false; model.InitChannelCache() })
	for range 10 {
		selected, err := model.GetRandomSatisfiedChannel("default", "gpt-4o-mini", 0, nil)
		require.NoError(t, err)
		require.NotNil(t, selected)
		assert.Equal(t, healthy.Id, selected.Id)
	}

	// 两个都暂停时无可用渠道
	for range 3 {
		_, err := RecordChannelApiProbe(healthy, ChannelHealthVerdictTransient, "HTTP 500")
		require.NoError(t, err)
	}
	selected, err := model.GetRandomSatisfiedChannel("default", "gpt-4o-mini", 0, nil)
	require.NoError(t, err)
	assert.Nil(t, selected)

	// 列表装配：外部渠道带健康态，非外部渠道为 nil
	plain := newHealthTestChannel(t, 7, false)
	channels := []*model.Channel{paused, healthy, plain}
	require.NoError(t, model.AttachChannelHealthStates(channels))
	require.NotNil(t, paused.HealthState)
	assert.True(t, paused.HealthState.DispatchPaused)
	assert.Nil(t, plain.HealthState)
}
