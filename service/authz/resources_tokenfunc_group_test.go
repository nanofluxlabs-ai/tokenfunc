package authz

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 分组定价权限：管理员默认能看、能维护分组，改价要 Root 逐人开放；Root 不受限
func TestGroupPricingPermissionDefaultsAndOverride(t *testing.T) {
	db := newAuthzTestDB(t)
	require.NoError(t, Init(db))

	assert.True(t, Can(7, common.RoleAdminUser, GroupPricingRead))
	assert.True(t, Can(7, common.RoleAdminUser, GroupPricingManage))
	assert.False(t, Can(7, common.RoleAdminUser, GroupPricingPrice), "改价默认不给管理员")
	assert.True(t, Can(1, common.RoleRootUser, GroupPricingPrice))
	assert.False(t, Can(9, common.RoleCommonUser, GroupPricingRead))

	require.NoError(t, SetUserPermissions(7, PermissionsMap{ResourceGroupPricing: {ActionPrice: true}}))
	assert.True(t, Can(7, common.RoleAdminUser, GroupPricingPrice))
	assert.False(t, Can(8, common.RoleAdminUser, GroupPricingPrice), "只对被开放的那个管理员生效")

	require.NoError(t, SetUserPermissions(7, PermissionsMap{ResourceGroupPricing: {ActionManage: false, ActionPrice: true}}))
	assert.False(t, Can(7, common.RoleAdminUser, GroupPricingManage))
}
