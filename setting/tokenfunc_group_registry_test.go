package setting

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// loadGroupRegistryForTest 直接灌注册表 option 值，并在测试结束时清空
func loadGroupRegistryForTest(t *testing.T, userGroups, channelGroups string) {
	t.Helper()
	cfg := config.GlobalConfig.Get("tokenfunc_group_setting")
	require.NotNil(t, cfg)
	require.NoError(t, config.UpdateConfigFromMap(cfg, map[string]string{"user_groups": userGroups, "channel_groups": channelGroups}))
	t.Cleanup(func() {
		_ = config.UpdateConfigFromMap(cfg, map[string]string{"user_groups": "{}", "channel_groups": "{}"})
	})
}

func TestListUserGroupsSynthesizesDefaultAndSortsByOrder(t *testing.T) {
	loadGroupRegistryForTest(t, `{"vip":{"label":"VIP","order":2},"ent_std":{"label":"企业标准","kind":"enterprise","order":1}}`, `{}`)

	entries := ListUserGroups()

	keys := make([]string, 0, len(entries))
	for _, entry := range entries {
		keys = append(keys, entry.Key)
	}
	assert.Equal(t, []string{"default", "ent_std", "vip"}, keys)
	assert.Equal(t, "Default group", entries[0].Label)
	assert.Equal(t, UserGroupKindEnterprise, entries[1].Kind)
	assert.True(t, IsRegisteredUserGroup("default"))
	assert.True(t, IsRegisteredUserGroup("ent_std"))
	assert.False(t, IsRegisteredUserGroup("ghost"))
}

func TestNormalizeUserGroupMetaFillsDefaultsAndRejectsUnknownKind(t *testing.T) {
	meta, err := NormalizeUserGroupMeta("ent_acme", UserGroupMeta{Label: "  ", Description: " 合同 "})
	require.NoError(t, err)
	assert.Equal(t, "ent_acme", meta.Label)
	assert.Equal(t, "合同", meta.Description)
	assert.Equal(t, UserGroupKindIndividual, meta.Kind)

	_, err = NormalizeUserGroupMeta("x", UserGroupMeta{Kind: "vip"})
	assert.ErrorIs(t, err, ErrUserGroupInvalidKind)

	assert.NoError(t, ValidateUserGroupKey("ent_acme-2"))
	assert.ErrorIs(t, ValidateUserGroupKey("Ent Acme"), ErrUserGroupInvalidKey)
	assert.ErrorIs(t, ValidateUserGroupKey(""), ErrUserGroupInvalidKey)
}

func TestListChannelGroupsFollowsRegistryOrderAndFallsBackToUsableDescription(t *testing.T) {
	previousRatio := ratio_setting.GroupRatio2JSONString()
	previousUsable := UserUsableGroups2JSONString()
	t.Cleanup(func() {
		_ = ratio_setting.UpdateGroupRatioByJSONString(previousRatio)
		_ = UpdateUserUsableGroupsByJSONString(previousUsable)
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"gptpro":1,"zeta":2}`))
	require.NoError(t, UpdateUserUsableGroupsByJSONString(`{"zeta":"Zeta pool"}`))
	loadGroupRegistryForTest(t, `{}`, `{"gptpro":{"label":"GPT 高速池","order":0},"default":{"label":"默认池","order":1}}`)

	entries := ListChannelGroups()

	require.Len(t, entries, 3)
	assert.Equal(t, "gptpro", entries[0].Key)
	assert.Equal(t, "GPT 高速池", entries[0].Label)
	assert.Equal(t, "default", entries[1].Key)
	// 未登记的分组排最后，名称回退到上游「用户可选分组」描述
	assert.Equal(t, "zeta", entries[2].Key)
	assert.Equal(t, "Zeta pool", entries[2].Label)
	assert.Equal(t, 2.0, entries[2].Ratio)
	assert.Equal(t, "ghost", ChannelGroupLabel("ghost"))
}
