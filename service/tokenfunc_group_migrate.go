package service

// TokenFunc 二开：可见性改为显式模型——每个用户分组能用哪些渠道分组只认它自己的列表，
// 不再有「对所有用户分组默认可见」的基线（上游 UserUsableGroups）。
// 本文件在主节点启动时做一次性迁移：把每个用户分组当前实际可见的集合原样写成显式列表，再清空基线，线上行为零变化。

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const userUsableGroupsOptionKey = "UserUsableGroups"

// MigrateExplicitGroupVisibility 基线非空时执行一次：
//   - 对每个已登记的用户分组（以及仍有用户的未登记分组），把「当前可见 ∩ GroupRatio，去掉自身与 auto」写成 +: 显式列表，
//     并按当前顺序写进注册表的 channel_order；
//   - 基线只保留 auto（上游靠它暴露令牌的自动分组），其余清空。
//
// 基线为空时什么都不做，所以重复启动是幂等的。
func MigrateExplicitGroupVisibility() error {
	defaults := setting.GetUserUsableGroupsCopy()
	hasBaseline := false
	for key := range defaults {
		if key != "auto" {
			hasBaseline = true
			break
		}
	}
	if !hasBaseline {
		return nil
	}

	ratios := ratio_setting.GetGroupRatioCopy()
	targets := map[string]struct{}{}
	for _, entry := range setting.ListUserGroups() {
		targets[entry.Key] = struct{}{}
	}
	counts, err := model.CountUsersByGroup()
	if err != nil {
		return err
	}
	for key, count := range counts {
		if key != "" && count > 0 {
			targets[key] = struct{}{}
		}
	}

	special := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()
	groups := setting.UserGroupsSnapshot()
	for userGroup := range targets {
		explicit := make(map[string]string)
		order := make([]string, 0)
		for _, option := range ListUserSelectableChannelGroups(userGroup) {
			if option.Key == userGroup {
				continue
			}
			explicit["+:"+option.Key] = option.Label
			order = append(order, option.Key)
		}
		if _, inRatio := ratios[userGroup]; inRatio {
			// 同名渠道分组由上游规则永远可见，顺序里也带上，保持它在列表中的位置
			order = userGroupOrderWithSelf(userGroup, order)
		}
		if len(explicit) == 0 {
			delete(special, userGroup)
		} else {
			special[userGroup] = explicit
		}
		if meta, registered := groups[userGroup]; registered {
			meta.ChannelOrder = order
			groups[userGroup] = meta
		}
	}

	baseline := map[string]string{}
	if desc, ok := defaults["auto"]; ok {
		baseline["auto"] = desc
	}
	if err := writeGroupOptions(map[string]any{
		userUsableGroupsOptionKey:   baseline,
		specialUsableGroupOptionKey: special,
		setting.UserGroupsOptionKey: groups,
	}); err != nil {
		return err
	}
	common.SysLog(common.LogText("migrated tokenfunc group visibility to explicit lists for %d user groups", len(targets)))
	return nil
}

// userGroupOrderWithSelf 把同名渠道分组按它当前的位置插回顺序列表
func userGroupOrderWithSelf(userGroup string, order []string) []string {
	for _, option := range ListUserSelectableChannelGroups(userGroup) {
		if option.Key == userGroup {
			// ListUserSelectableChannelGroups 已按该用户分组视角排好，直接取它的位置
			position := option.Order
			if position > len(order) {
				position = len(order)
			}
			out := make([]string, 0, len(order)+1)
			out = append(out, order[:position]...)
			out = append(out, userGroup)
			out = append(out, order[position:]...)
			return out
		}
	}
	return order
}
