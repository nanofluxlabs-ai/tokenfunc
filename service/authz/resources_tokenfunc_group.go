package authz

// TokenFunc 二开：用户分组与分组定价的管理员权限。
// 查看、维护分组默认给管理员；会改计费的定价写入默认不给，由 Root 在「管理员权限」里逐人开放。

const (
	ResourceGroupPricing = "group_pricing"

	ActionManage = "manage"
	ActionPrice  = "price"
)

var (
	GroupPricingRead   = Permission{Resource: ResourceGroupPricing, Action: ActionRead}
	GroupPricingManage = Permission{Resource: ResourceGroupPricing, Action: ActionManage}
	GroupPricingPrice  = Permission{Resource: ResourceGroupPricing, Action: ActionPrice}
)

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourceGroupPricing,
		LabelKey: "Group Pricing",
		Actions: []ActionDefinition{
			{
				Action:         ActionRead,
				LabelKey:       "View group pricing",
				DescriptionKey: "View user groups, channel groups, and each user group's pricing.",
				DefaultRoles:   []string{BuiltInRoleAdmin},
			},
			{
				Action:         ActionManage,
				LabelKey:       "Manage user groups",
				DescriptionKey: "Create user groups and edit their names, types, and order.",
				DefaultRoles:   []string{BuiltInRoleAdmin},
			},
			{
				Action:         ActionPrice,
				LabelKey:       "Edit group pricing",
				DescriptionKey: "Change which channel groups a user group can use and at what ratio, and delete user groups.",
			},
		},
	})
}
