package model

import (
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	kitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestFilterCandidateIDs(t *testing.T) {
	alphaSetting := `{"task_plugin_key":"alpha"}`
	betaSetting := `{"task_plugin_key":"beta"}`
	alpha := &Channel{Id: 900001, Type: constant.ChannelTypeTaskPlugin, Status: common.ChannelStatusEnabled, Setting: &alphaSetting}
	beta := &Channel{Id: 900002, Type: constant.ChannelTypeTaskPlugin, Status: common.ChannelStatusEnabled, Setting: &betaSetting}
	ordinary := &Channel{Id: 900003, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled}
	kling := &Channel{Id: 900004, Type: constant.ChannelTypeKling, Status: common.ChannelStatusEnabled}
	jimeng := &Channel{Id: 900005, Type: constant.ChannelTypeJimeng, Status: common.ChannelStatusEnabled}
	matchingCustom := &Channel{Id: 900010, Type: constant.ChannelTypeAdvancedCustom, Status: common.ChannelStatusEnabled}
	matchingCustom.SetOtherSettings(kitdto.ChannelOtherSettings{
		AdvancedCustom: &kitdto.AdvancedCustomConfig{
			Routes: []kitdto.AdvancedCustomRoute{{
				IncomingPath: "/v1/chat/completions",
				Models:       []string{"gpt-4"},
			}},
		},
	})
	otherCustom := &Channel{Id: 900011, Type: constant.ChannelTypeAdvancedCustom, Status: common.ChannelStatusEnabled}
	otherCustom.SetOtherSettings(kitdto.ChannelOtherSettings{
		AdvancedCustom: &kitdto.AdvancedCustomConfig{
			Routes: []kitdto.AdvancedCustomRoute{{
				IncomingPath: "/v1/responses",
				Models:       []string{"gpt-4"},
			}},
		},
	})

	pathFilter := dto.ChannelFilter{Kind: dto.FilterRequestPath, RequestPath: "/v1/chat/completions"}
	emptyPathFilter := dto.ChannelFilter{Kind: dto.FilterRequestPath, RequestPath: ""}

	tests := []struct {
		name      string
		ids       []int
		modelName string
		filters   []dto.ChannelFilter
		wantKept  []int
		wantEmpty dto.ChannelFilterKind
	}{
		{
			name:      "identity keeps matching type-59 key",
			ids:       []int{900001, 900002},
			modelName: "shared",
			filters:   identityFilters("alpha", nil),
			wantKept:  []int{900001},
		},
		{
			name:      "identity empty key drops all type-59",
			ids:       []int{900001, 900002},
			modelName: "shared",
			filters:   identityFilters("", nil),
			wantKept:  []int{},
			wantEmpty: dto.FilterTaskPluginIdentity,
		},
		{
			name:      "identity empty key keeps ordinary channel",
			ids:       []int{900003},
			modelName: "ordinary",
			filters:   identityFilters("", nil),
			wantKept:  []int{900003},
		},
		{
			name:      "identity keeps matching legacy type",
			ids:       []int{900004, 900005},
			modelName: "legacy",
			filters:   identityFilters("legacy-alpha", []int{constant.ChannelTypeKling}),
			wantKept:  []int{900004},
		},
		{
			name:      "identity keeps all listed legacy types",
			ids:       []int{900004, 900005},
			modelName: "legacy",
			filters:   identityFilters("legacy-alpha", []int{constant.ChannelTypeKling, constant.ChannelTypeJimeng}),
			wantKept:  []int{900004, 900005},
		},
		{
			name:      "identity keyed with no types drops legacy",
			ids:       []int{900004, 900005},
			modelName: "legacy",
			filters:   identityFilters("legacy-alpha", nil),
			wantKept:  []int{},
			wantEmpty: dto.FilterTaskPluginIdentity,
		},
		{
			name:      "identity drops missing cache entry",
			ids:       []int{900004, 999999},
			modelName: "legacy",
			filters:   identityFilters("legacy-alpha", []int{constant.ChannelTypeKling}),
			wantKept:  []int{900004},
		},
		{
			name:      "empty request path is a passthrough including missing ids",
			ids:       []int{900003, 900010, 999999},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{emptyPathFilter},
			wantKept:  []int{900003, 900010, 999999},
		},
		{
			name:      "request path keeps missing cache entry for consistency",
			ids:       []int{900003, 999999},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{pathFilter},
			wantKept:  []int{900003, 999999},
		},
		{
			name:      "request path keeps matching type-58 and ordinary",
			ids:       []int{900003, 900010, 900011},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{pathFilter},
			wantKept:  []int{900003, 900010},
		},
		{
			name:      "request path empties when only unmatched type-58 remains",
			ids:       []int{900011},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{pathFilter},
			wantKept:  []int{},
			wantEmpty: dto.FilterRequestPath,
		},
		{
			name:      "intersection attributes empty set to identity after path keeps candidates",
			ids:       []int{900001, 900010},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{pathFilter, identityFilters("missing", nil)[0]},
			wantKept:  []int{},
			wantEmpty: dto.FilterTaskPluginIdentity,
		},
		{
			name:      "intersection attributes empty set to path when path runs first",
			ids:       []int{900011},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{identityFilters("", nil)[0], pathFilter},
			wantKept:  []int{},
			wantEmpty: dto.FilterRequestPath,
		},
	}

	channelSyncLock.Lock()
	previous := channelsIDM
	channelsIDM = map[int]*Channel{
		900001: alpha,
		900002: beta,
		900003: ordinary,
		900004: kling,
		900005: jimeng,
		900010: matchingCustom,
		900011: otherCustom,
	}
	t.Cleanup(func() {
		channelsIDM = previous
		channelSyncLock.Unlock()
	})

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			kept, emptiedBy := filterCandidateIDs(testCase.ids, testCase.modelName, testCase.filters)
			if testCase.wantKept == nil {
				assert.Nil(t, kept)
			} else {
				assert.Equal(t, testCase.wantKept, kept)
			}
			assert.Equal(t, testCase.wantEmpty, emptiedBy)
		})
	}
}

func TestChannelSatisfiesFilters(t *testing.T) {
	alphaSetting := `{"task_plugin_key":"alpha"}`
	alpha := &Channel{Id: 1, Type: constant.ChannelTypeTaskPlugin, Setting: &alphaSetting}
	ordinary := &Channel{Id: 2, Type: constant.ChannelTypeOpenAI}
	custom := &Channel{Id: 3, Type: constant.ChannelTypeAdvancedCustom}
	custom.SetOtherSettings(kitdto.ChannelOtherSettings{
		AdvancedCustom: &kitdto.AdvancedCustomConfig{
			Routes: []kitdto.AdvancedCustomRoute{{
				IncomingPath: "/v1/chat/completions",
				Models:       []string{"gpt-4"},
			}},
		},
	})

	ok, kind := ChannelSatisfiesFilters(nil, "gpt-4", nil)
	assert.False(t, ok)
	assert.Equal(t, dto.ChannelFilterKind(""), kind)

	ok, kind = ChannelSatisfiesFilters(alpha, "shared", identityFilters("alpha", nil))
	require.True(t, ok)
	assert.Equal(t, dto.ChannelFilterKind(""), kind)

	ok, kind = ChannelSatisfiesFilters(alpha, "shared", identityFilters("beta", nil))
	assert.False(t, ok)
	assert.Equal(t, dto.FilterTaskPluginIdentity, kind)

	ok, kind = ChannelSatisfiesFilters(ordinary, "gpt-4", []dto.ChannelFilter{{
		Kind:        dto.FilterRequestPath,
		RequestPath: "/v1/chat/completions",
	}})
	require.True(t, ok)
	assert.Equal(t, dto.ChannelFilterKind(""), kind)

	ok, kind = ChannelSatisfiesFilters(custom, "gpt-4", []dto.ChannelFilter{{
		Kind:        dto.FilterRequestPath,
		RequestPath: "/v1/responses",
	}})
	assert.False(t, ok)
	assert.Equal(t, dto.FilterRequestPath, kind)
}

// TokenFunc 二开：外部渠道暂停派发后，DB 分发路径（GetChannel）直接查健康态表跳过它；只支持 PostgreSQL
func TestGetChannelSkipsDispatchPausedExternalChannel(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	tables := []any{&Channel{}, &Ability{}, &ChannelHealthState{}, &ChannelHealthEvent{}}
	previousDB, previousLogDB := DB, LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousMemoryCache := common.MemoryCacheEnabled
	DB, LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.MemoryCacheEnabled = false
	initCol()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.MemoryCacheEnabled = previousMemoryCache
		initCol()
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))

	external := true
	paused := &Channel{Id: 5, Type: constant.ChannelTypeOpenAI, Key: "sk-a", Status: common.ChannelStatusEnabled, Name: "paused", Models: "gpt-4o-mini", Group: "default", IsExternal: &external}
	healthy := &Channel{Id: 6, Type: constant.ChannelTypeOpenAI, Key: "sk-b", Status: common.ChannelStatusEnabled, Name: "healthy", Models: "gpt-4o-mini", Group: "default", IsExternal: &external}
	require.NoError(t, paused.Insert())
	require.NoError(t, healthy.Insert())
	state := NewChannelHealthState(paused.Id)
	state.ApiHealth = ChannelHealthFailed
	require.NoError(t, SaveChannelHealthState(state))

	for range 10 {
		selected, err := GetChannel("default", "gpt-4o-mini", 0, nil)
		require.NoError(t, err)
		require.NotNil(t, selected)
		assert.Equal(t, healthy.Id, selected.Id)
	}

	// 非外部渠道即使有 failed 行也不受影响
	plain := false
	paused.IsExternal = &plain
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", paused.Id).Update("is_external", false).Error)
	seen := map[int]bool{}
	for range 40 {
		selected, err := GetChannel("default", "gpt-4o-mini", 0, nil)
		require.NoError(t, err)
		require.NotNil(t, selected)
		seen[selected.Id] = true
	}
	assert.True(t, seen[paused.Id], "取消外部标记后应重新参与分发")
}
