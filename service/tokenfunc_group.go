package service

// TokenFunc 二开：用户分组 × 渠道分组的定价视图与写回。
//
// 计费仍由上游完成：倍率 = GroupGroupRatio[用户分组][渠道分组]，没配则 GroupRatio[渠道分组]；
// 可见性 = UserUsableGroups（默认可见）叠加 group_special_usable_group[用户分组] 的 +:/-: 差异。
// 本文件只把这几个 option 合成一张「某用户分组看到的渠道分组表」，以及把表反算回差异写回 option。

import (
	"cmp"
	"errors"
	"fmt"
	"maps"
	"math"
	"slices"
	"strconv"
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
	// 统一保存只接受分组定价页自己的 option
	ErrGroupSettingKeyNotAllowed = errors.New("option is not a group setting")
	ErrGroupSettingInvalid       = errors.New("invalid group setting")
)

// ChannelGroupOption 某用户分组可选的渠道分组，已按后台排序
type ChannelGroupOption struct {
	Key         string  `json:"key"`
	Label       string  `json:"label"`
	Description string  `json:"description"`
	Ratio       float64 `json:"ratio"`
	Order       int     `json:"order"`
}

// ListUserSelectableChannelGroups 用户分组可选（可见且在 GroupRatio 里）的渠道分组，
// 按该用户分组自己的顺序排列，未列出的按全局 order、key 排在后面
func ListUserSelectableChannelGroups(userGroup string) []ChannelGroupOption {
	usable := GetUserUsableGroups(userGroup)
	options := make([]ChannelGroupOption, 0, len(usable))
	for _, entry := range setting.ListChannelGroups() {
		if _, ok := usable[entry.Key]; !ok || entry.Key == "auto" {
			continue
		}
		options = append(options, ChannelGroupOption{
			Key:         entry.Key,
			Label:       entry.Label,
			Description: entry.Description,
			Ratio:       GetUserGroupRatio(userGroup, entry.Key),
			Order:       entry.Order,
		})
	}
	slices.SortStableFunc(options, func(a, b ChannelGroupOption) int {
		return setting.CompareChannelGroupsFor(userGroup, a.Key, b.Key)
	})
	for index := range options {
		options[index].Order = index
	}
	return options
}

// ResolveDefaultUsingGroup 令牌分组留空时实际使用的渠道分组：
// 用户分组本身就是可选渠道分组（如 default）时取自己，与上游行为一致；
// 否则取该用户分组可见渠道分组里排序第一的；都没有时原样返回，让后续环节按「分组无渠道」报错。
func ResolveDefaultUsingGroup(userGroup string) string {
	return ResolveUsingGroupCandidates(userGroup)[0]
}

// ResolveUsingGroupCandidates 令牌分组留空时按顺序尝试的渠道分组：
//   - 用户分组本身是可选渠道分组（如 default）：只走自己，不自动跨到别的分组，避免被动按更高倍率计费；
//   - 用户分组不是渠道分组（企业档位）：该用户分组可用的全部渠道分组，按它自己的排序；
//   - 没有任何可见渠道分组：原样返回用户分组，让分发器报无可用渠道。
func ResolveUsingGroupCandidates(userGroup string) []string {
	if IsUserSelectableGroup(userGroup, userGroup) {
		return []string{userGroup}
	}
	options := ListUserSelectableChannelGroups(userGroup)
	if len(options) == 0 {
		return []string{userGroup}
	}
	candidates := make([]string, 0, len(options))
	for _, option := range options {
		candidates = append(candidates, option.Key)
	}
	return candidates
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

// GetUserGroupPricing 合成某用户分组的渠道分组定价表，口径与计费、鉴权完全一致。
// 顺序：可见的按该用户分组自己的顺序在前，不可见的按全局顺序在后。
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
	slices.SortStableFunc(rows, func(a, b UserGroupPricingRow) int {
		if a.Visible != b.Visible {
			if a.Visible {
				return -1
			}
			return 1
		}
		if !a.Visible {
			return setting.CompareChannelGroups(a.ChannelGroup, b.ChannelGroup)
		}
		return setting.CompareChannelGroupsFor(userGroup, a.ChannelGroup, b.ChannelGroup)
	})
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
// inputs 里可见行的先后顺序即该用户分组的渠道分组顺序，一并写进注册表。
func SaveUserGroupPricing(userGroup string, inputs []UserGroupPricingInput) error {
	return mutateGroupOptions(func(state *groupOptionState) (map[string]string, error) {
		values, err := state.applyUserGroupPricing(userGroup, inputs)
		if err != nil {
			return nil, err
		}
		return encodeGroupOptions(values)
	})
}

// groupOptionState 分组相关 option 的一份可修改快照。
// 统一保存时先把本次提交的段一配置叠上去，再在其上算定价，保证两段基于同一份数据、一次落库。
type groupOptionState struct {
	ratios   map[string]float64                  // GroupRatio：渠道分组 → 基准倍率
	defaults map[string]string                   // UserUsableGroups：默认可见的渠道分组
	channels map[string]setting.ChannelGroupMeta // 渠道分组注册表（名称、排序）
	special  map[string]map[string]string        // group_special_usable_group
	matrix   map[string]map[string]float64       // GroupGroupRatio
	groups   map[string]setting.UserGroupMeta    // 用户分组注册表
}

// groupOptionKeys 分组定价会整表写回的 option，写时在事务里一起锁住（见 mutateGroupOptions）
var groupOptionKeys = []string{
	"GroupRatio",
	"UserUsableGroups",
	groupGroupRatioOptionKey,
	specialUsableGroupOptionKey,
	setting.ChannelGroupsOptionKey,
	setting.UserGroupsOptionKey,
}

// mutateGroupOptions 分组 option 的统一写入口：事务里锁住 groupOptionKeys、用数据库里的最新值建快照，
// 交给 fn 修改并返回要写回的 option，与 fn 同一事务提交。
// 这几个 option 都是「读整表 → 改一个用户分组 → 写整表」，多副本下本副本内存最多落后数据库一个
// SYNC_FREQUENCY 周期；不以数据库值为准就会把别的副本刚写的改动覆盖掉（生产 2026-11-20 实际发生）。
func mutateGroupOptions(fn func(state *groupOptionState) (map[string]string, error)) error {
	return model.MutateOptionsInTransaction(groupOptionKeys, func(current map[string]string) (map[string]string, error) {
		state := currentGroupOptionState()
		for _, key := range groupOptionKeys {
			value, ok := current[key]
			if !ok {
				continue
			}
			if err := state.applyStoredGroupOption(key, value); err != nil {
				return nil, err
			}
		}
		return fn(&state)
	})
}

// currentGroupOptionState 本进程内存里的快照；mutateGroupOptions 会再用数据库值覆盖一遍
func currentGroupOptionState() groupOptionState {
	return groupOptionState{
		ratios:   ratio_setting.GetGroupRatioCopy(),
		defaults: setting.GetUserUsableGroupsCopy(),
		channels: setting.ChannelGroupsSnapshot(),
		special:  ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.ReadAll(),
		matrix:   ratio_setting.GetGroupGroupRatioCopy(),
		groups:   setting.UserGroupsSnapshot(),
	}
}

// channelGroupLabel 与 setting.ChannelGroupLabel 同口径，但读的是这份快照
func (state groupOptionState) channelGroupLabel(key string) string {
	if meta, ok := state.channels[key]; ok && strings.TrimSpace(meta.Label) != "" {
		return meta.Label
	}
	if label, ok := state.defaults[key]; ok {
		return label
	}
	return key
}

// applyUserGroupPricing 在快照上改写该用户分组的切片，返回需要落库的 option 新值
func (state groupOptionState) applyUserGroupPricing(userGroup string, inputs []UserGroupPricingInput) (map[string]any, error) {
	if _, ok := state.groups[userGroup]; !ok {
		return nil, setting.ErrUserGroupNotFound
	}
	rowSpecial := make(map[string]string)
	rowRatios := make(map[string]float64)
	channelOrder := make([]string, 0, len(inputs))
	for _, input := range inputs {
		key := strings.TrimSpace(input.ChannelGroup)
		base, ok := state.ratios[key]
		if !ok {
			return nil, fmt.Errorf("%w: %s", ErrChannelGroupUnknown, key)
		}
		if input.Visible {
			channelOrder = append(channelOrder, key)
		}
		_, defaultVisible := state.defaults[key]
		if input.Visible != defaultVisible && key != userGroup {
			if input.Visible {
				rowSpecial["+:"+key] = state.channelGroupLabel(key)
			} else {
				rowSpecial["-:"+key] = ""
			}
		}
		if !input.Visible || input.Ratio == nil {
			continue
		}
		ratio := *input.Ratio
		if ratio < 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) {
			return nil, fmt.Errorf("%w: %s", ErrChannelGroupRatioFormat, key)
		}
		if ratio != base {
			rowRatios[key] = ratio
		}
	}
	if len(rowSpecial) == 0 {
		delete(state.special, userGroup)
	} else {
		state.special[userGroup] = rowSpecial
	}
	if len(rowRatios) == 0 {
		delete(state.matrix, userGroup)
	} else {
		state.matrix[userGroup] = rowRatios
	}
	meta := state.groups[userGroup]
	meta.ChannelOrder = channelOrder
	state.groups[userGroup] = meta
	return map[string]any{
		groupGroupRatioOptionKey:    state.matrix,
		specialUsableGroupOptionKey: state.special,
		setting.UserGroupsOptionKey: state.groups,
	}, nil
}

// UserGroupPricingSave 统一保存里附带的某个用户分组定价表
type UserGroupPricingSave struct {
	Group string                  `json:"group"`
	Rows  []UserGroupPricingInput `json:"rows"`
}

// SaveGroupSettings 分组定价页的统一保存：段一的分组 option 与段二某用户分组的定价表一次校验、一个事务落库。
// options 只能是分组定价页自己的 key；定价表在「当前值 + 本次 options」之上计算，
// 因此本次删掉的渠道分组若仍被定价表引用，整次保存失败，什么都不写。
func SaveGroupSettings(options map[string]string, pricing *UserGroupPricingSave) error {
	return mutateGroupOptions(func(state *groupOptionState) (map[string]string, error) {
		for key, value := range options {
			if err := state.overlayGroupOption(key, value); err != nil {
				return nil, err
			}
		}
		values := make(map[string]string, len(options)+3)
		maps.Copy(values, options)
		if _, ok := options[setting.ChannelGroupsOptionKey]; ok {
			// 注册表按规范化后的值落库（去空格），不是客户端原文
			registry, err := setting.ChannelGroupsJSON(state.channels)
			if err != nil {
				return nil, err
			}
			values[setting.ChannelGroupsOptionKey] = registry
		}
		if pricing == nil {
			return values, nil
		}
		pricingValues, err := state.applyUserGroupPricing(pricing.Group, pricing.Rows)
		if err != nil {
			return nil, err
		}
		encoded, err := encodeGroupOptions(pricingValues)
		if err != nil {
			return nil, err
		}
		maps.Copy(values, encoded)
		return values, nil
	})
}

// applyStoredGroupOption 把数据库里的 option 值叠到快照上：与 overlayGroupOption 同一套解析，
// 多一个只允许来自数据库的用户分组注册表
func (state *groupOptionState) applyStoredGroupOption(key string, value string) error {
	if key != setting.UserGroupsOptionKey {
		return state.overlayGroupOption(key, value)
	}
	groups := map[string]setting.UserGroupMeta{}
	if err := common.UnmarshalJsonStr(value, &groups); err != nil {
		return fmt.Errorf("%w: %s: %v", ErrGroupSettingInvalid, key, err)
	}
	if _, ok := groups[setting.DefaultGroupKey]; !ok {
		// 与 setting.UserGroupsSnapshot 一致：default 恒存在
		groups[setting.DefaultGroupKey] = state.groups[setting.DefaultGroupKey]
	}
	state.groups = groups
	return nil
}

// overlayGroupOption 校验一个提交的 option，并把会影响定价计算的值叠到快照上。
// 先全部解析一遍，避免事务提交后刷新内存时才发现格式错误。
func (state *groupOptionState) overlayGroupOption(key string, value string) error {
	invalid := func(err error) error { return fmt.Errorf("%w: %s: %v", ErrGroupSettingInvalid, key, err) }
	switch key {
	case "GroupRatio":
		if err := ratio_setting.CheckGroupRatio(value); err != nil {
			return invalid(err)
		}
		state.ratios = map[string]float64{}
		if err := common.UnmarshalJsonStr(value, &state.ratios); err != nil {
			return invalid(err)
		}
	case "UserUsableGroups":
		state.defaults = map[string]string{}
		if err := common.UnmarshalJsonStr(value, &state.defaults); err != nil {
			return invalid(err)
		}
	case groupGroupRatioOptionKey:
		state.matrix = map[string]map[string]float64{}
		if err := common.UnmarshalJsonStr(value, &state.matrix); err != nil {
			return invalid(err)
		}
	case specialUsableGroupOptionKey:
		state.special = map[string]map[string]string{}
		if err := common.UnmarshalJsonStr(value, &state.special); err != nil {
			return invalid(err)
		}
	case setting.ChannelGroupsOptionKey:
		state.channels = map[string]setting.ChannelGroupMeta{}
		if err := common.UnmarshalJsonStr(value, &state.channels); err != nil {
			return invalid(err)
		}
		for groupKey, meta := range state.channels {
			normalized, err := setting.NormalizeChannelGroupMeta(meta)
			if err != nil {
				return invalid(fmt.Errorf("%s: %w", groupKey, err))
			}
			state.channels[groupKey] = normalized
		}
	case "TopupGroupRatio":
		var ratios map[string]float64
		if err := common.UnmarshalJsonStr(value, &ratios); err != nil {
			return invalid(err)
		}
	case "AutoGroups":
		var groups []string
		if err := common.UnmarshalJsonStr(value, &groups); err != nil {
			return invalid(err)
		}
	case "MaxTokenAutoGroups":
		if limit, err := strconv.Atoi(value); err != nil || limit < 1 {
			return invalid(errors.New("must be a positive integer"))
		}
	case "DefaultUseAutoGroup":
		if _, err := strconv.ParseBool(value); err != nil {
			return invalid(err)
		}
	default:
		return fmt.Errorf("%w: %s", ErrGroupSettingKeyNotAllowed, key)
	}
	return nil
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
	meta, err := setting.NormalizeUserGroupMeta(key, meta)
	if err != nil {
		return err
	}
	return mutateGroupOptions(func(state *groupOptionState) (map[string]string, error) {
		if _, exists := state.groups[key]; exists {
			return nil, setting.ErrUserGroupExists
		}
		meta.Order = 0
		for _, existing := range state.groups {
			meta.Order = max(meta.Order, existing.Order+1)
		}
		state.groups[key] = meta
		return encodeGroupOptions(map[string]any{setting.UserGroupsOptionKey: state.groups})
	})
}

// UpdateUserGroup 修改名称 / 说明 / 类型，排序不变
func UpdateUserGroup(key string, meta setting.UserGroupMeta) error {
	meta, err := setting.NormalizeUserGroupMeta(key, meta)
	if err != nil {
		return err
	}
	return mutateGroupOptions(func(state *groupOptionState) (map[string]string, error) {
		current, ok := state.groups[key]
		if !ok {
			return nil, setting.ErrUserGroupNotFound
		}
		meta.Order = current.Order
		meta.ChannelOrder = current.ChannelOrder
		state.groups[key] = meta
		return encodeGroupOptions(map[string]any{setting.UserGroupsOptionKey: state.groups})
	})
}

// DeleteUserGroup 删除用户分组并级联清掉它的倍率覆盖与可见差异；default 与仍有用户的分组拒删
func DeleteUserGroup(key string) error {
	if key == setting.DefaultGroupKey {
		return setting.ErrUserGroupDefault
	}
	counts, err := model.CountUsersByGroup()
	if err != nil {
		return err
	}
	if counts[key] > 0 {
		return ErrUserGroupInUse
	}
	return mutateGroupOptions(func(state *groupOptionState) (map[string]string, error) {
		if _, ok := state.groups[key]; !ok {
			return nil, setting.ErrUserGroupNotFound
		}
		delete(state.groups, key)
		delete(state.special, key)
		delete(state.matrix, key)
		return encodeGroupOptions(map[string]any{
			setting.UserGroupsOptionKey: state.groups,
			groupGroupRatioOptionKey:    state.matrix,
			specialUsableGroupOptionKey: state.special,
		})
	})
}

// ReorderUserGroups 按给定顺序重排；未列出的分组保持相对顺序排在后面
func ReorderUserGroups(keys []string) error {
	return mutateGroupOptions(func(state *groupOptionState) (map[string]string, error) {
		groups := state.groups
		order := 0
		seen := make(map[string]struct{}, len(keys))
		for _, key := range keys {
			meta, ok := groups[key]
			if !ok {
				return nil, fmt.Errorf("%w: %s", setting.ErrUserGroupNotFound, key)
			}
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			meta.Order = order
			groups[key] = meta
			order++
		}
		// 未列出的按原先的 order、key 顺序排在后面
		rest := make([]string, 0, len(groups))
		for key := range groups {
			if _, ok := seen[key]; !ok {
				rest = append(rest, key)
			}
		}
		slices.SortFunc(rest, func(a, b string) int {
			return cmp.Or(cmp.Compare(groups[a].Order, groups[b].Order), strings.Compare(a, b))
		})
		for _, key := range rest {
			meta := groups[key]
			meta.Order = order
			groups[key] = meta
			order++
		}
		return encodeGroupOptions(map[string]any{setting.UserGroupsOptionKey: groups})
	})
}

// encodeGroupOptions 把 option 的结构化新值序列化成落库字符串
func encodeGroupOptions(values map[string]any) (map[string]string, error) {
	encoded := make(map[string]string, len(values))
	for key, value := range values {
		data, err := common.Marshal(value)
		if err != nil {
			return nil, err
		}
		encoded[key] = string(data)
	}
	return encoded, nil
}

// writeGroupOptions 不加锁的整表落库，只给启动迁移用；日常写入口一律走 mutateGroupOptions
func writeGroupOptions(values map[string]any) error {
	encoded, err := encodeGroupOptions(values)
	if err != nil {
		return err
	}
	return model.UpdateOptionsBulk(encoded)
}
