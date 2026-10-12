package service

import (
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

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
		transition, err := RecordChannelApiProbe(channel, false, "HTTP 502")
		require.NoError(t, err, "failure %d", i)
		assert.False(t, transition.Paused)
	}
	state, err := model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, model.ChannelHealthUnknown, state.ApiHealth)
	assert.Equal(t, 2, state.ApiFailCount)
	assert.False(t, model.IsChannelDispatchPaused(channel.Id))

	transition, err := RecordChannelApiProbe(channel, false, "HTTP 502")
	require.NoError(t, err)
	assert.True(t, transition.Paused)
	state, err = model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, model.ChannelHealthFailed, state.ApiHealth)
	assert.True(t, state.DispatchPaused)
	assert.Equal(t, "HTTP 502", state.LastApiError)
	assert.True(t, model.IsChannelDispatchPaused(channel.Id))

	// failed 态下连续成功达到恢复阈值（默认 2）才恢复
	transition, err = RecordChannelApiProbe(channel, true, "HTTP 200")
	require.NoError(t, err)
	assert.False(t, transition.Resumed)
	assert.True(t, model.IsChannelDispatchPaused(channel.Id))
	transition, err = RecordChannelApiProbe(channel, true, "HTTP 200")
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

	// 非 5xx 不计数
	RecordExternalChannelRelayFailure(channel, 429, "rate limited")
	state, err := model.GetChannelHealthState(channel.Id)
	require.NoError(t, err)
	assert.Equal(t, 0, state.InferenceFailCount)

	RecordExternalChannelRelayFailure(channel, 502, "bad gateway")
	RecordExternalChannelRelayFailure(channel, 503, "unavailable")
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

func TestChannelHealthSlowProbeRecoverThresholdAndManualTestShortcut(t *testing.T) {
	setupChannelHealthPostgres(t)
	channel := newHealthTestChannel(t, 3, true)

	for range 2 {
		_, err := RecordChannelInferenceProbe(channel, false, "timeout")
		require.NoError(t, err)
	}
	assert.True(t, model.IsChannelDispatchPaused(channel.Id))

	// 慢探恢复阈值默认 1：一次成功即恢复
	transition, err := RecordChannelInferenceProbe(channel, true, "")
	require.NoError(t, err)
	assert.True(t, transition.Resumed)

	for range 2 {
		_, err := RecordChannelInferenceProbe(channel, false, "timeout")
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
		transition, err := RecordChannelApiProbe(channel, false, "HTTP 500")
		require.NoError(t, err)
		assert.False(t, transition.Paused)
	}
	RecordExternalChannelRelayFailure(channel, 500, "boom")
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
		_, err := RecordChannelApiProbe(paused, false, "HTTP 500")
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
		_, err := RecordChannelApiProbe(healthy, false, "HTTP 500")
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
