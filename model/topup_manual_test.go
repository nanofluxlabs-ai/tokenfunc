package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// 管理员手动充值：余额、充值单、订单中心与钱包流水口径一致
func TestRegisterManualTopUpCreditsWalletAndRecordsOrder(t *testing.T) {
	setupFinancePostgres(t)
	alice := createEnterpriseTestUser(t, "alice", common.RoleCommonUser)
	quota := 10 * int(common.QuotaPerUnit)

	topUp, err := RegisterManualTopUp(alice.Id, common.RoleRootUser, quota, 10, PaymentMethodBankTransfer, "REF-001", "127.0.0.1")
	require.NoError(t, err)
	assert.Equal(t, common.TopUpStatusSuccess, topUp.Status)
	assert.Equal(t, PaymentProviderAdmin, topUp.PaymentProvider)
	assert.True(t, strings.HasPrefix(topUp.TradeNo, "ADMIN"))

	stored, err := GetUserById(alice.Id, false)
	require.NoError(t, err)
	assert.Equal(t, alice.Quota+quota, stored.Quota)

	var row TopUp
	require.NoError(t, DB.Where("trade_no = ?", topUp.TradeNo).First(&row).Error)
	assert.Equal(t, "REF-001", row.Reference)
	assert.Equal(t, int64(quota), row.Amount)
	assert.Equal(t, float64(10), row.Money)
	assert.Equal(t, PaymentMethodBankTransfer, row.PaymentMethod)

	window := FinanceRange{Start: topUp.CompleteTime - 60, EndExcl: topUp.CompleteTime + 60}
	orders, total, err := ListFinanceOrders(FinanceOrderFilter{Range: window, PaymentMethod: PaymentProviderAdmin}, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	assert.Equal(t, float64(10), orders[0].USDAmount)
	assert.Equal(t, int64(quota), orders[0].CreditAmount)
	assert.Equal(t, "USD", orders[0].Currency)
	assert.Equal(t, "REF-001", orders[0].Reference)

	byReference, total, err := ListFinanceOrders(FinanceOrderFilter{Range: window, Keyword: "ref-00"}, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	assert.Equal(t, topUp.TradeNo, byReference[0].TradeNo)

	entries, err := ListFinanceTopupEntries(alice.Id, window)
	require.NoError(t, err)
	require.Len(t, entries, 1, "充值日志不带 op 字段，不能被当成管理员调额再记一次")
	assert.Equal(t, FinanceTopupSourceOnline, entries[0].Source)
	assert.Equal(t, int64(quota), entries[0].Quota)
	assert.Equal(t, "REF-001", entries[0].Content)
	assert.Equal(t, "admin/bank_transfer", entries[0].PaymentMethod)
}

func TestRegisterManualTopUpRejectsInvalidTargets(t *testing.T) {
	setupFinancePostgres(t)
	admin := createEnterpriseTestUser(t, "admin-peer", common.RoleAdminUser)
	owner := createEnterpriseTestUser(t, "acme-owner", common.RoleCommonUser)
	require.NoError(t, DB.Create(&Enterprise{UserId: owner.Id, Name: "Acme", BillingMode: EnterpriseBillingModePrepaid, Status: EnterpriseStatusActive}).Error)
	quota := int(common.QuotaPerUnit)

	_, err := RegisterManualTopUp(admin.Id, common.RoleAdminUser, quota, 1, PaymentMethodGift, "", "")
	assert.ErrorIs(t, err, ErrUserQuotaPermission, "管理员不能给同级或更高角色充值")
	_, err = RegisterManualTopUp(owner.Id, common.RoleRootUser, quota, 1, PaymentMethodGift, "", "")
	assert.ErrorIs(t, err, ErrManualTopUpEnterpriseOwner)
	_, err = RegisterManualTopUp(admin.Id, common.RoleRootUser, 0, 0, PaymentMethodGift, "", "")
	assert.ErrorIs(t, err, ErrInvalidTopUpQuota)
	_, err = RegisterManualTopUp(admin.Id, common.RoleRootUser, quota, 1, "cash", "", "")
	assert.ErrorIs(t, err, ErrManualTopUpPaymentMethod)
	_, err = RegisterManualTopUp(99999, common.RoleRootUser, quota, 1, PaymentMethodGift, "", "")
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)

	var count int64
	require.NoError(t, DB.Model(&TopUp{}).Count(&count).Error)
	assert.Zero(t, count, "失败路径不得留下充值单")
	for _, user := range []*User{admin, owner} {
		stored, err := GetUserById(user.Id, false)
		require.NoError(t, err)
		assert.Equal(t, user.Quota, stored.Quota)
	}
}
