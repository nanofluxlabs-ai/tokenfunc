package model

import (
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 企业模块只支持 PostgreSQL（TokenFunc 二开约定），测试必须跑在真实 PG 上
func setupEnterprisePostgres(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)

	previousDB := DB
	DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	initCol()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(&Enterprise{}, &User{}))
		require.NoError(t, sqlDB.Close())
		DB = previousDB
		common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
		initCol()
	})
	require.NoError(t, db.Migrator().DropTable(&Enterprise{}, &User{}))
	require.NoError(t, db.AutoMigrate(&User{}, &Enterprise{}))
}

func createEnterpriseTestUser(t *testing.T, username string, role int) *User {
	t.Helper()
	user := &User{Username: username, Password: "password123", DisplayName: username, Role: role, Status: common.UserStatusEnabled, Quota: 1000, AffCode: username}
	require.NoError(t, DB.Create(user).Error)
	return user
}

func TestEnterpriseCreateAndUpgrade(t *testing.T) {
	setupEnterprisePostgres(t)
	previousQuotaForNewUser := common.QuotaForNewUser
	common.QuotaForNewUser = 5000
	t.Cleanup(func() { common.QuotaForNewUser = previousQuotaForNewUser })

	// 新建主账号：不发新用户赠送额度，开票抬头经 jsonb 往返不丢字段
	owner := &User{Username: "acme", Password: "password123", DisplayName: "acme"}
	created := &Enterprise{
		Name:           "  Acme Inc  ",
		BillingProfile: EnterpriseBillingProfile{CompanyName: "Acme Inc", TaxId: "TAX-1"},
	}
	require.NoError(t, CreateEnterpriseWithNewUser(owner, created))
	stored, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	assert.Equal(t, "Acme Inc", stored.Name)
	assert.Equal(t, EnterpriseBillingModePrepaid, stored.BillingMode)
	assert.Equal(t, EnterpriseStatusActive, stored.Status)
	assert.Equal(t, EnterpriseDefaultPaymentTermsDays, stored.PaymentTermsDays)
	assert.Equal(t, EnterpriseDefaultCurrency, stored.Currency)
	assert.Equal(t, EnterpriseBillingProfile{CompanyName: "Acme Inc", TaxId: "TAX-1"}, stored.BillingProfile)
	quota, err := GetUserQuota(owner.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 0, quota)

	// 升级已有普通用户：保留余额；重复升级、管理员账号都被拒绝
	common1 := createEnterpriseTestUser(t, "bob", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(common1.Id, &Enterprise{Name: "Bob Co"}))
	quota, err = GetUserQuota(common1.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 1000, quota)
	assert.ErrorIs(t, UpgradeUserToEnterprise(common1.Id, &Enterprise{Name: "Bob Co 2"}), ErrEnterpriseAlreadyExists)

	admin := createEnterpriseTestUser(t, "admin1", common.RoleAdminUser)
	assert.ErrorIs(t, UpgradeUserToEnterprise(admin.Id, &Enterprise{Name: "Admin Co"}), ErrEnterpriseUserNotEligible)

	assert.Error(t, UpgradeUserToEnterprise(createEnterpriseTestUser(t, "carol", common.RoleCommonUser).Id, &Enterprise{Name: " "}))
}

func TestEnterpriseUserTypeFilterAndList(t *testing.T) {
	setupEnterprisePostgres(t)
	personal := createEnterpriseTestUser(t, "personal1", common.RoleCommonUser)
	entUser := createEnterpriseTestUser(t, "entuser1", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(entUser.Id, &Enterprise{Name: "Globex", ContactName: "Hank"}))

	page := &common.PageInfo{Page: 1, PageSize: 20}
	userIds := func(users []*User) []int {
		ids := make([]int, 0, len(users))
		for _, u := range users {
			ids = append(ids, u.Id)
		}
		return ids
	}

	users, total, err := GetAllUsers(page, UserTypePersonal)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, []int{personal.Id}, userIds(users))

	users, total, err = GetAllUsers(page, UserTypeEnterprise)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, []int{entUser.Id}, userIds(users))

	_, total, err = GetAllUsers(page, "")
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)

	users, total, err = SearchUsers("user", "", nil, nil, UserTypeEnterprise, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, []int{entUser.Id}, userIds(users))

	// 企业列表：关键字不区分大小写，可匹配联系人与主账号用户名
	for _, keyword := range []string{"globex", "hank", "ENTUSER"} {
		items, total, err := ListEnterprises(keyword, "", 0, 20)
		require.NoError(t, err)
		require.Equal(t, int64(1), total, keyword)
		assert.Equal(t, "Globex", items[0].Name)
		assert.Equal(t, "entuser1", items[0].Username)
		assert.Equal(t, 1000, items[0].Quota)
	}
	_, total, err = ListEnterprises("", EnterpriseBillingModeCredit, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(0), total)
}
