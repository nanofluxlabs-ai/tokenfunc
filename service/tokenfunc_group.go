package service

// TokenFunc 二开：用户分组 × 渠道分组的定价视图与写回。
//
// 计费仍由上游完成：倍率 = GroupGroupRatio[用户分组][渠道分组]，没配则 GroupRatio[渠道分组]；
// 可见性 = UserUsableGroups（默认可见）叠加 group_special_usable_group[用户分组] 的 +:/-: 差异。
// 本文件只把这几个 option 合成一张「某用户分组看到的渠道分组表」，以及把表反算回差异写回 option。

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	groupGroupRatioOptionKey    = "GroupGroupRatio"
	specialUsableGroupOptionKey = "group_ratio_setting.group_special_usable_group"
)

var (
	ErrUserGroupInUse          = errors.New("user group still has users")
	ErrChannelGroupUnknown     = errors.New("unknown channel group")
	ErrChannelGroupRatioFormat = errors.New("channel group ratio must be a non-negative number")
)

// ChannelGroupOption 某用户分组可选的渠道分组，已按后台排序
type ChannelGroupOption struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Ratio float64 `json:"ratio"`
	Order int     `json:"order"`
}

// ListUserSelectableChannelGroups 用户分组可选（可见且在 GroupRatio 里）的渠道分组，按 order、key 排序
func ListUserSelectableChannelGroups(userGroup string) []ChannelGroupOption {
	usable := GetUserUsableGroups(userGroup)
	options := make([]ChannelGroupOption, 0, len(usable))
	for _, entry := range setting.ListChannelGroups() {
		if _, ok := usable[entry.Key]; !ok || entry.Key == "auto" {
			continue
		}
		options = append(options, ChannelGroupOption{
			Key:   entry.Key,
			Label: entry.Label,
			Ratio: GetUserGroupRatio(userGroup, entry.Key),
			Order: entry.Order,
		})
	}
	return options
}

// ResolveDefaultUsingGroup 令牌分组留空时实际使用的渠道分组：
// 用户分组本身就是可选渠道分组（如 default）时取自己，与上游行为一致；
// 否则取该用户分组可见渠道分组里排序第一的；都没有时原样返回，让后续环节按「分组无渠道」报错。
func ResolveDefaultUsingGroup(userGroup string) string {
	if IsUserSelectableGroup(userGroup, userGroup) {
		return userGroup
	}
	if options := ListUserSelectableChannelGroups(userGroup); len(options) > 0 {
		return options[0].Key
	}
	return userGroup
}

// UserGroupPricingRow 某用户分组视角下的一个渠道分组
type UserGroupPricingRow struct {
	ChannelGroup   string   `json:"channel_group"`
	Label          string   `json:"label"`
	BaseRatio      float64  `json:"base_ratio"`
	DefaultVisible bool     `json:"default_visible"`
	Visible        bool     `json:"visible"`
	Ratio          *float64 `json:"ratio"`
	EffectiveRatio float64  `json:"effective_ratio"`
	// Locked 用户分组 key 本身就是这个渠道分组：上游总会把它算作可见，不允许隐藏
	Locked bool `json:"locked"`
}

// GetUserGroupPricing 合成某用户分组的渠道分组定价表，口径与计费、鉴权完全一致
func GetUserGroupPricing(userGroup string) []UserGroupPricingRow {
	usable := GetUserUsableGroups(userGroup)
	defaults := setting.GetUserUsableGroupsCopy()
	entries := setting.ListChannelGroups()
	rows := make([]UserGroupPricingRow, 0, len(entries))
	for _, entry := range entries {
		_, visible := usable[entry.Key]
		_, defaultVisible := defaults[entry.Key]
		row := UserGroupPricingRow{
			ChannelGroup:   entry.Key,
			Label:          entry.Label,
			BaseRatio:      entry.Ratio,
			DefaultVisible: defaultVisible,
			Visible:        visible,
			EffectiveRatio: GetUserGroupRatio(userGroup, entry.Key),
			Locked:         entry.Key == userGroup,
		}
		if ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, entry.Key); ok {
			row.Ratio = &ratio
		}
		rows = append(rows, row)
	}
	return rows
}

// UserGroupPricingInput 保存定价表时的一行
type UserGroupPricingInput struct {
	ChannelGroup string   `json:"channel_group"`
	Visible      bool     `json:"visible"`
	Ratio        *float64 `json:"ratio"`
}

// SaveUserGroupPricing 把定价表反算成相对默认可见的 +:/-: 差异与倍率覆盖，只改该用户分组的切片；
// 未出现在 inputs 里的渠道分组视为继承默认。与基准价相同的倍率不记为覆盖。
func SaveUserGroupPricing(userGroup string, inputs []UserGroupPricingInput) error {
	if !setting.IsRegisteredUserGroup(userGroup) {
		return setting.ErrUserGroupNotFound
	}
	ratios := ratio_setting.GetGroupRatioCopy()
	defaults := setting.GetUserUsableGroupsCopy()
	rowSpecial := make(map[string]string)
	rowRatios := make(map[string]float64)
	for _, input := range inputs {
		key := strings.TrimSpace(input.ChannelGroup)
		base, ok := ratios[key]
		if !ok {
			return fmt.Errorf("%w: %s", ErrChannelGroupUnknown, key)
		}
		_, defaultVisible := defaults[key]
		if input.Visible != defaultVisible && key != userGroup {
			if input.Visible {
				rowSpecial["+:"+key] = setting.ChannelGroupLabel(key)
			} else {
				rowSpecial["-:"+key] = ""
			}
		}
		if !input.Visible || input.Ratio == nil {
			continue
		}
		ratio := *input.Ratio
		if ratio < 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) {
			return fmt.Errorf("%w: %s", ErrChannelGroupRatioFormat, key)
		}
		if ratio != base {
			rowRatios[key] = ratio
		}
	}
	special := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()
	matrix := ratio_setting.GetGroupGroupRatioCopy()
	if len(rowSpecial) == 0 {
		delete(special, userGroup)
	} else {
		special[userGroup] = rowSpecial
	}
	if len(rowRatios) == 0 {
		delete(matrix, userGroup)
	} else {
		matrix[userGroup] = rowRatios
	}
	return writeGroupOptions(map[string]any{
		groupGroupRatioOptionKey:    matrix,
		specialUsableGroupOptionKey: special,
	})
}

// UserGroupOverrideCount 某用户分组与基准不同的格数（倍率覆盖 + 可见差异），列表页展示用
func UserGroupOverrideCount(userGroup string) int {
	count := 0
	if ratios, ok := ratio_setting.GetGroupGroupRatioCopy()[userGroup]; ok {
		count += len(ratios)
	}
	if special, ok := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get(userGroup); ok {
		count += len(special)
	}
	return count
}

// CreateUserGroup 新增用户分组，排到最后
func CreateUserGroup(key string, meta setting.UserGroupMeta) error {
	key = strings.TrimSpace(key)
	if err := setting.ValidateUserGroupKey(key); err != nil {
		return err
	}
	groups := setting.UserGroupsSnapshot()
	if _, exists := groups[key]; exists {
		return setting.ErrUserGroupExists
	}
	meta, err := setting.NormalizeUserGroupMeta(key, meta)
	if err != nil {
		return err
	}
	meta.Order = 0
	for _, existing := range groups {
		meta.Order = max(meta.Order, existing.Order+1)
	}
	groups[key] = meta
	return writeUserGroups(groups)
}

// UpdateUserGroup 修改名称 / 说明 / 类型，排序不变
func UpdateUserGroup(key string, meta setting.UserGroupMeta) error {
	groups := setting.UserGroupsSnapshot()
	current, ok := groups[key]
	if !ok {
		return setting.ErrUserGroupNotFound
	}
	meta, err := setting.NormalizeUserGroupMeta(key, meta)
	if err != nil {
		return err
	}
	meta.Order = current.Order
	groups[key] = meta
	return writeUserGroups(groups)
}

// DeleteUserGroup 删除用户分组并级联清掉它的倍率覆盖与可见差异；default 与仍有用户的分组拒删
func DeleteUserGroup(key string) error {
	if key == setting.DefaultGroupKey {
		return setting.ErrUserGroupDefault
	}
	groups := setting.UserGroupsSnapshot()
	if _, ok := groups[key]; !ok {
		return setting.ErrUserGroupNotFound
	}
	counts, err := model.CountUsersByGroup()
	if err != nil {
		return err
	}
	if counts[key] > 0 {
		return ErrUserGroupInUse
	}
	delete(groups, key)
	special := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll()
	delete(special, key)
	matrix := ratio_setting.GetGroupGroupRatioCopy()
	delete(matrix, key)
	return writeGroupOptions(map[string]any{
		setting.UserGroupsOptionKey: groups,
		groupGroupRatioOptionKey:    matrix,
		specialUsableGroupOptionKey: special,
	})
}

// ReorderUserGroups 按给定顺序重排；未列出的分组保持相对顺序排在后面
func ReorderUserGroups(keys []string) error {
	groups := setting.UserGroupsSnapshot()
	order := 0
	seen := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		meta, ok := groups[key]
		if !ok {
			return fmt.Errorf("%w: %s", setting.ErrUserGroupNotFound, key)
		}
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		meta.Order = order
		groups[key] = meta
		order++
	}
	for _, entry := range setting.ListUserGroups() {
		if _, ok := seen[entry.Key]; ok {
			continue
		}
		meta := groups[entry.Key]
		meta.Order = order
		groups[entry.Key] = meta
		order++
	}
	return writeUserGroups(groups)
}

func writeUserGroups(groups map[string]setting.UserGroupMeta) error {
	return writeGroupOptions(map[string]any{setting.UserGroupsOptionKey: groups})
}

// writeGroupOptions 把若干 option 的新值一次性落库并刷新内存（走上游 option 更新链路，多节点同步照旧）
func writeGroupOptions(values map[string]any) error {
	encoded := make(map[string]string, len(values))
	for key, value := range values {
		data, err := common.Marshal(value)
		if err != nil {
			return err
		}
		encoded[key] = string(data)
	}
	return model.UpdateOptionsBulk(encoded)
}
