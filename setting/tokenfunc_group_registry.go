package setting

// TokenFunc 二开：用户分组与渠道分组注册表。
//
// 上游把 user.group、token.group、channel.group 与 GroupRatio 的 key 当作同一份清单，
// 运营分不清「谁在用」和「走哪个池」。这里只补两张语义表：
//   - 用户分组：谁在用（default / vip / 企业档位 / 企业专属），值落在 user.group
//   - 渠道分组：走哪个池、什么基准价，key 仍以 GroupRatio 为准，这里只补名称与排序
//
// 倍率、可见性、计费继续用上游 option（GroupRatio / GroupGroupRatio / UserUsableGroups /
// group_special_usable_group），本文件不参与计费。

import (
	"cmp"
	"errors"
	"regexp"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
)

const (
	// DefaultGroupKey 默认分组，既是默认用户分组也是默认渠道分组，不可删除
	DefaultGroupKey = "default"

	UserGroupKindIndividual = "individual"
	UserGroupKindEnterprise = "enterprise"
)

var (
	ErrUserGroupInvalidKey  = errors.New("user group key must be 1-64 chars of lowercase letters, digits, underscore or hyphen")
	ErrUserGroupInvalidKind = errors.New("user group kind must be individual or enterprise")
	ErrUserGroupNotFound    = errors.New("user group not found")
	ErrUserGroupExists      = errors.New("user group already exists")
	ErrUserGroupDefault     = errors.New("default user group cannot be deleted")
)

var userGroupKeyPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

// UserGroupMeta 用户分组的展示信息
type UserGroupMeta struct {
	Label       string `json:"label"`
	Description string `json:"description"`
	Kind        string `json:"kind"`
	Order       int    `json:"order"`
}

// ChannelGroupMeta 渠道分组的展示信息；key 以 GroupRatio 为准，这里只存名称与排序
type ChannelGroupMeta struct {
	Label string `json:"label"`
	Order int    `json:"order"`
}

// TokenFuncGroupSetting 两张注册表，各占一个 option key：
// tokenfunc_group_setting.user_groups / tokenfunc_group_setting.channel_groups
type TokenFuncGroupSetting struct {
	UserGroups    *types.RWMap[string, UserGroupMeta]    `json:"user_groups"`
	ChannelGroups *types.RWMap[string, ChannelGroupMeta] `json:"channel_groups"`
}

var tokenFuncGroupSetting = TokenFuncGroupSetting{
	UserGroups:    types.NewRWMap[string, UserGroupMeta](),
	ChannelGroups: types.NewRWMap[string, ChannelGroupMeta](),
}

func init() {
	config.GlobalConfig.Register("tokenfunc_group_setting", &tokenFuncGroupSetting)
}

// UserGroupEntry 带 key 的用户分组
type UserGroupEntry struct {
	Key string `json:"key"`
	UserGroupMeta
}

// ChannelGroupEntry 带 key 与基准倍率的渠道分组
type ChannelGroupEntry struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Order int     `json:"order"`
	Ratio float64 `json:"ratio"`
}

func userGroupsMap() *types.RWMap[string, UserGroupMeta] {
	if tokenFuncGroupSetting.UserGroups == nil {
		tokenFuncGroupSetting.UserGroups = types.NewRWMap[string, UserGroupMeta]()
	}
	return tokenFuncGroupSetting.UserGroups
}

func channelGroupsMap() *types.RWMap[string, ChannelGroupMeta] {
	if tokenFuncGroupSetting.ChannelGroups == nil {
		tokenFuncGroupSetting.ChannelGroups = types.NewRWMap[string, ChannelGroupMeta]()
	}
	return tokenFuncGroupSetting.ChannelGroups
}

// ValidateUserGroupKey 校验用户分组 key 的格式
func ValidateUserGroupKey(key string) error {
	if !userGroupKeyPattern.MatchString(key) {
		return ErrUserGroupInvalidKey
	}
	return nil
}

// NormalizeUserGroupMeta 去空格、补默认值并校验类型；label 为空时用 key
func NormalizeUserGroupMeta(key string, meta UserGroupMeta) (UserGroupMeta, error) {
	meta.Label = strings.TrimSpace(meta.Label)
	meta.Description = strings.TrimSpace(meta.Description)
	meta.Kind = strings.TrimSpace(meta.Kind)
	if meta.Label == "" {
		meta.Label = key
	}
	if meta.Kind == "" {
		meta.Kind = UserGroupKindIndividual
	}
	if meta.Kind != UserGroupKindIndividual && meta.Kind != UserGroupKindEnterprise {
		return meta, ErrUserGroupInvalidKind
	}
	return meta, nil
}

// defaultUserGroupMeta 注册表里没有 default 时合成的一条；描述是英文源文本，由 web 控制台翻译
func defaultUserGroupMeta() UserGroupMeta {
	return UserGroupMeta{Label: "Default group", Kind: UserGroupKindIndividual, Order: 0}
}

// GetUserGroupMeta 读取用户分组；default 恒存在
func GetUserGroupMeta(key string) (UserGroupMeta, bool) {
	if meta, ok := userGroupsMap().Get(key); ok {
		return meta, true
	}
	if key == DefaultGroupKey {
		return defaultUserGroupMeta(), true
	}
	return UserGroupMeta{}, false
}

// IsRegisteredUserGroup 用户分组是否已登记；default 恒真
func IsRegisteredUserGroup(key string) bool {
	_, ok := GetUserGroupMeta(key)
	return ok
}

// ListUserGroups 全部用户分组（含 default），按 order、key 排序
func ListUserGroups() []UserGroupEntry {
	all := userGroupsMap().ReadAll()
	if _, ok := all[DefaultGroupKey]; !ok {
		all[DefaultGroupKey] = defaultUserGroupMeta()
	}
	entries := make([]UserGroupEntry, 0, len(all))
	for key, meta := range all {
		entries = append(entries, UserGroupEntry{Key: key, UserGroupMeta: meta})
	}
	slices.SortFunc(entries, func(a, b UserGroupEntry) int {
		return cmp.Or(cmp.Compare(a.Order, b.Order), strings.Compare(a.Key, b.Key))
	})
	return entries
}

// UserGroupsSnapshot 当前注册表的副本（含合成的 default），供写回 option 前修改
func UserGroupsSnapshot() map[string]UserGroupMeta {
	all := userGroupsMap().ReadAll()
	if _, ok := all[DefaultGroupKey]; !ok {
		all[DefaultGroupKey] = defaultUserGroupMeta()
	}
	return all
}

// UserGroupsJSON 把注册表序列化成 option 值
func UserGroupsJSON(groups map[string]UserGroupMeta) (string, error) {
	data, err := common.Marshal(groups)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// UserGroupsOptionKey / ChannelGroupsOptionKey 两张注册表的 option key
const (
	UserGroupsOptionKey    = "tokenfunc_group_setting.user_groups"
	ChannelGroupsOptionKey = "tokenfunc_group_setting.channel_groups"
)

// GetChannelGroupMeta 读取渠道分组的展示信息
func GetChannelGroupMeta(key string) (ChannelGroupMeta, bool) {
	return channelGroupsMap().Get(key)
}

// ChannelGroupLabel 渠道分组名称：注册表 → 上游「用户可选分组」描述 → key
func ChannelGroupLabel(key string) string {
	if meta, ok := channelGroupsMap().Get(key); ok && strings.TrimSpace(meta.Label) != "" {
		return meta.Label
	}
	return GetUsableGroupDescription(key)
}

// ChannelGroupOrder 渠道分组排序值；未登记的排到最后
func ChannelGroupOrder(key string) int {
	if meta, ok := channelGroupsMap().Get(key); ok {
		return meta.Order
	}
	return int(^uint(0) >> 1)
}

// CompareChannelGroups 按 order、key 排序渠道分组 key
func CompareChannelGroups(a, b string) int {
	return cmp.Or(cmp.Compare(ChannelGroupOrder(a), ChannelGroupOrder(b)), strings.Compare(a, b))
}

// ListChannelGroups 全部渠道分组：key 集合取 GroupRatio，合并注册表的名称与排序，按 order、key 排序
func ListChannelGroups() []ChannelGroupEntry {
	ratios := ratio_setting.GetGroupRatioCopy()
	entries := make([]ChannelGroupEntry, 0, len(ratios))
	for key, ratio := range ratios {
		entries = append(entries, ChannelGroupEntry{
			Key:   key,
			Label: ChannelGroupLabel(key),
			Order: ChannelGroupOrder(key),
			Ratio: ratio,
		})
	}
	slices.SortFunc(entries, func(a, b ChannelGroupEntry) int {
		return cmp.Or(cmp.Compare(a.Order, b.Order), strings.Compare(a.Key, b.Key))
	})
	return entries
}

// ChannelGroupsSnapshot 当前渠道分组注册表的副本
func ChannelGroupsSnapshot() map[string]ChannelGroupMeta {
	return channelGroupsMap().ReadAll()
}

// ChannelGroupsJSON 把渠道分组注册表序列化成 option 值
func ChannelGroupsJSON(groups map[string]ChannelGroupMeta) (string, error) {
	data, err := common.Marshal(groups)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
