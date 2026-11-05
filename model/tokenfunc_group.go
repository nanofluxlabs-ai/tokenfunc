package model

// TokenFunc 二开：用户分组注册表的数据库侧支撑——按分组统计用户数，以及启动时从存量数据播种注册表。

import (
	"slices"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm/clause"
)

// CountUsersByGroup 未删除用户按分组计数
func CountUsersByGroup() (map[string]int64, error) {
	var rows []struct {
		Group string `gorm:"column:group_name"`
		Count int64  `gorm:"column:count"`
	}
	// group 是保留字，交给 GORM 按方言加引号
	err := DB.Model(&User{}).
		Select("? AS group_name, COUNT(*) AS count", clause.Column{Name: "group"}).
		Group("group").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	counts := make(map[string]int64, len(rows))
	for _, row := range rows {
		counts[row.Group] = row.Count
	}
	return counts, nil
}

// SeedTokenFuncGroupRegistries 注册表 option 尚未落库时从存量数据播种，幂等：
//   - 渠道分组：GroupRatio 全部 key，名称取上游「用户可选分组」描述，default 排第一
//   - 用户分组：default ∪（users.group 去重 ∩ GroupRatio 的 key），名称 = key
//
// 只在主节点、InitOptionMap 之后调用。
func SeedTokenFuncGroupRegistries() error {
	ratios := ratio_setting.GetGroupRatioCopy()
	if !optionPersisted(setting.ChannelGroupsOptionKey) && len(ratios) > 0 {
		groups := make(map[string]setting.ChannelGroupMeta, len(ratios))
		for order, key := range sortedKeysWithDefaultFirst(ratios) {
			groups[key] = setting.ChannelGroupMeta{Label: setting.GetUsableGroupDescription(key), Order: order}
		}
		value, err := setting.ChannelGroupsJSON(groups)
		if err != nil {
			return err
		}
		if err := UpdateOption(setting.ChannelGroupsOptionKey, value); err != nil {
			return err
		}
		common.SysLog(common.LogText("seeded tokenfunc channel group registry with %d groups", len(groups)))
	}
	if !optionPersisted(setting.UserGroupsOptionKey) {
		counts, err := CountUsersByGroup()
		if err != nil {
			return err
		}
		groups := map[string]setting.UserGroupMeta{
			setting.DefaultGroupKey: {Label: "Default group", Kind: setting.UserGroupKindIndividual, Order: 0},
		}
		order := 1
		for _, key := range sortedKeysWithDefaultFirst(counts) {
			if _, inRatio := ratios[key]; key == setting.DefaultGroupKey || !inRatio {
				continue
			}
			groups[key] = setting.UserGroupMeta{Label: key, Kind: setting.UserGroupKindIndividual, Order: order}
			order++
		}
		value, err := setting.UserGroupsJSON(groups)
		if err != nil {
			return err
		}
		if err := UpdateOption(setting.UserGroupsOptionKey, value); err != nil {
			return err
		}
		common.SysLog(common.LogText("seeded tokenfunc user group registry with %d groups", len(groups)))
	}
	return nil
}

// optionPersisted option 是否已落库（区分「从未配置」与「运营配成了空表」）
func optionPersisted(key string) bool {
	var count int64
	DB.Model(&Option{}).Where("key = ?", key).Count(&count)
	return count > 0
}

// sortedKeysWithDefaultFirst default 排第一，其余按字母序
func sortedKeysWithDefaultFirst[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		if key != setting.DefaultGroupKey {
			keys = append(keys, key)
		}
	}
	slices.Sort(keys)
	if _, ok := m[setting.DefaultGroupKey]; ok {
		keys = append([]string{setting.DefaultGroupKey}, keys...)
	}
	return keys
}
