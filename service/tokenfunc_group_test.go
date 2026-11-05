package service

import (
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// setupGroupPricingState 一套固定的分组配置：
//   - 渠道分组 default / gptpro / ent_pool，基准 1 / 1 / 1.5，排序 ent_pool < default < gptpro
//   - 默认可见 default、gptpro
//   - 用户分组 ent_std：隐藏 default、额外开放 ent_pool，gptpro 覆盖为 0.9
//   - 用户分组 lonely：全部隐藏
func setupGroupPricingState(t *testing.T) {
	t.Helper()
	previousRatio := ratio_setting.GroupRatio2JSONString()
	previousMatrix := ratio_setting.GroupGroupRatio2JSONString()
	previousUsable := setting.UserUsableGroups2JSONString()
	groupCfg := config.GlobalConfig.Get("group_ratio_setting")
	registryCfg := config.GlobalConfig.Get("tokenfunc_group_setting")
	require.NotNil(t, groupCfg)
	require.NotNil(t, registryCfg)
	previousSpecial := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.MarshalJSONString()
	t.Cleanup(func() {
		_ = ratio_setting.UpdateGroupRatioByJSONString(previousRatio)
		_ = ratio_setting.UpdateGroupGroupRatioByJSONString(previousMatrix)
		_ = setting.UpdateUserUsableGroupsByJSONString(previousUsable)
		_ = config.UpdateConfigFromMap(groupCfg, map[string]string{"group_special_usable_group": previousSpecial})
		_ = config.UpdateConfigFromMap(registryCfg, map[string]string{"user_groups": "{}", "channel_groups": "{}"})
	})
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"gptpro":1,"ent_pool":1.5}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"ent_std":{"gptpro":0.9}}`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","gptpro":"GPT Pro"}`))
	require.NoError(t, config.UpdateConfigFromMap(groupCfg, map[string]string{
		"group_special_usable_group": `{"ent_std":{"-:default":"","+:ent_pool":"Acme pool"},"lonely":{"-:default":"","-:gptpro":""}}`,
	}))
	require.NoError(t, config.UpdateConfigFromMap(registryCfg, map[string]string{
		"user_groups":    `{"ent_std":{"label":"企业标准","kind":"enterprise","order":1},"lonely":{"label":"孤岛","order":2}}`,
		"channel_groups": `{"ent_pool":{"label":"Acme 专属池","order":0},"default":{"label":"默认池","order":1},"gptpro":{"label":"GPT 高速池","order":2}}`,
	}))
}

func TestResolveDefaultUsingGroup(t *testing.T) {
	setupGroupPricingState(t)

	cases := []struct {
		name      string
		userGroup string
		want      string
	}{
		{"用户分组本身就是可选渠道分组时取自己", "default", "default"},
		{"企业档位取可见渠道分组里排序第一的", "ent_std", "ent_pool"},
		{"未登记的用户分组按默认可见集合取排序第一的", "ghost", "default"},
		{"没有任何可见渠道分组时原样返回", "lonely", "lonely"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, ResolveDefaultUsingGroup(tc.userGroup))
		})
	}
}

func TestListUserSelectableChannelGroupsFollowsRegistryOrder(t *testing.T) {
	setupGroupPricingState(t)

	options := ListUserSelectableChannelGroups("ent_std")

	require.Len(t, options, 2)
	assert.Equal(t, "ent_pool", options[0].Key)
	assert.Equal(t, "Acme 专属池", options[0].Label)
	assert.Equal(t, 1.5, options[0].Ratio)
	assert.Equal(t, "gptpro", options[1].Key)
	assert.Equal(t, 0.9, options[1].Ratio)
}

func TestGetUserGroupPricingMatchesBillingAndVisibilityLookups(t *testing.T) {
	setupGroupPricingState(t)

	rows := GetUserGroupPricing("ent_std")

	require.Len(t, rows, 3)
	byKey := map[string]UserGroupPricingRow{}
	for _, row := range rows {
		byKey[row.ChannelGroup] = row
	}
	assert.Equal(t, []string{"ent_pool", "default", "gptpro"}, []string{rows[0].ChannelGroup, rows[1].ChannelGroup, rows[2].ChannelGroup})

	assert.True(t, byKey["ent_pool"].Visible)
	assert.False(t, byKey["ent_pool"].DefaultVisible)
	assert.Nil(t, byKey["ent_pool"].Ratio)
	assert.Equal(t, 1.5, byKey["ent_pool"].EffectiveRatio)

	assert.False(t, byKey["default"].Visible)
	assert.True(t, byKey["default"].DefaultVisible)

	require.NotNil(t, byKey["gptpro"].Ratio)
	assert.Equal(t, 0.9, *byKey["gptpro"].Ratio)
	assert.Equal(t, GetUserGroupRatio("ent_std", "gptpro"), byKey["gptpro"].EffectiveRatio)

	// 用户分组 key 本身就是渠道分组时锁定为可见
	defaultRows := GetUserGroupPricing("default")
	for _, row := range defaultRows {
		assert.Equal(t, row.ChannelGroup == "default", row.Locked)
	}
}

func setupTokenFuncGroupPostgres(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	tables := []any{&model.User{}, &model.Option{}}
	// UpdateOptionsBulk 会回写 common.OptionMap，测试进程没跑 InitOptionMap
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	common.OptionMapRWMutex.Unlock()
	previousDB := model.DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		require.NoError(t, sqlDB.Close())
		model.DB = previousDB
		common.SetDatabaseTypes(previousMain, previousLog)
	})
	require.NoError(t, db.Migrator().DropTable(tables...))
	require.NoError(t, db.AutoMigrate(tables...))
}

func TestSaveUserGroupPricingOnlyTouchesThatGroupSlice(t *testing.T) {
	setupTokenFuncGroupPostgres(t)
	setupGroupPricingState(t)
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"default":0.8},"ent_std":{"gptpro":0.9}}`))

	ratio := func(v float64) *float64 { return &v }
	err := SaveUserGroupPricing("ent_std", []UserGroupPricingInput{
		{ChannelGroup: "default", Visible: false},
		{ChannelGroup: "gptpro", Visible: true, Ratio: ratio(0.95)},
		{ChannelGroup: "ent_pool", Visible: true, Ratio: ratio(1.5)}, // 与基准相同，不记为覆盖
	})
	require.NoError(t, err)

	matrix := ratio_setting.GetGroupGroupRatioCopy()
	assert.Equal(t, map[string]float64{"default": 0.8}, matrix["vip"], "其它用户分组的覆盖不动")
	assert.Equal(t, map[string]float64{"gptpro": 0.95}, matrix["ent_std"])
	special, ok := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get("ent_std")
	require.True(t, ok)
	assert.Equal(t, map[string]string{"-:default": "", "+:ent_pool": "Acme 专属池"}, special)
	assert.Equal(t, 0.95, GetUserGroupRatio("ent_std", "gptpro"))
	assert.Equal(t, "ent_pool", ResolveDefaultUsingGroup("ent_std"))

	// 全部回到默认：切片被整体删除
	require.NoError(t, SaveUserGroupPricing("ent_std", []UserGroupPricingInput{
		{ChannelGroup: "default", Visible: true},
		{ChannelGroup: "gptpro", Visible: true},
		{ChannelGroup: "ent_pool", Visible: false},
	}))
	_, hasMatrix := ratio_setting.GetGroupGroupRatioCopy()["ent_std"]
	_, hasSpecial := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get("ent_std")
	assert.False(t, hasMatrix)
	assert.False(t, hasSpecial)

	assert.ErrorIs(t, SaveUserGroupPricing("ent_std", []UserGroupPricingInput{{ChannelGroup: "nope", Visible: true}}), ErrChannelGroupUnknown)
	assert.ErrorIs(t, SaveUserGroupPricing("ent_std", []UserGroupPricingInput{{ChannelGroup: "gptpro", Visible: true, Ratio: ratio(-1)}}), ErrChannelGroupRatioFormat)
	assert.ErrorIs(t, SaveUserGroupPricing("ghost", nil), setting.ErrUserGroupNotFound)
}

func TestUserGroupLifecycleCascadesAndGuards(t *testing.T) {
	setupTokenFuncGroupPostgres(t)
	setupGroupPricingState(t)

	require.NoError(t, CreateUserGroup("ent_acme", setting.UserGroupMeta{Label: "Acme", Kind: setting.UserGroupKindEnterprise}))
	assert.ErrorIs(t, CreateUserGroup("ent_acme", setting.UserGroupMeta{}), setting.ErrUserGroupExists)
	assert.ErrorIs(t, CreateUserGroup("Bad Key", setting.UserGroupMeta{}), setting.ErrUserGroupInvalidKey)
	entries := setting.ListUserGroups()
	assert.Equal(t, "ent_acme", entries[len(entries)-1].Key, "新建的排最后")

	require.NoError(t, ReorderUserGroups([]string{"ent_acme", "default"}))
	entries = setting.ListUserGroups()
	assert.Equal(t, []string{"ent_acme", "default", "ent_std", "lonely"}, []string{entries[0].Key, entries[1].Key, entries[2].Key, entries[3].Key})

	// 删除级联清掉覆盖与可见差异
	require.NoError(t, DeleteUserGroup("ent_std"))
	assert.False(t, setting.IsRegisteredUserGroup("ent_std"))
	_, hasMatrix := ratio_setting.GetGroupGroupRatioCopy()["ent_std"]
	_, hasSpecial := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get("ent_std")
	assert.False(t, hasMatrix)
	assert.False(t, hasSpecial)

	assert.ErrorIs(t, DeleteUserGroup("default"), setting.ErrUserGroupDefault)
	assert.ErrorIs(t, DeleteUserGroup("ghost"), setting.ErrUserGroupNotFound)

	// 仍有用户的分组拒删
	user := &model.User{Username: "acme-owner", Password: "password123", DisplayName: "acme", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "ent_acme", AffCode: "acme"}
	require.NoError(t, model.DB.Create(user).Error)
	assert.ErrorIs(t, DeleteUserGroup("ent_acme"), ErrUserGroupInUse)
	counts, err := model.CountUsersByGroup()
	require.NoError(t, err)
	assert.Equal(t, int64(1), counts["ent_acme"])
}
