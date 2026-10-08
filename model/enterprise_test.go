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
		require.NoError(t, db.Migrator().DropTable(enterpriseTestTables...))
		require.NoError(t, sqlDB.Close())
		DB = previousDB
		common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
		initCol()
	})
	require.NoError(t, db.Migrator().DropTable(enterpriseTestTables...))
	require.NoError(t, db.AutoMigrate(enterpriseTestTables...))
}

var enterpriseTestTables = []any{
	&User{}, &Token{}, &Enterprise{}, &EnterpriseDepartment{}, &EnterpriseEmployee{}, &EnterpriseProject{}, &EnterpriseTokenAssignment{},
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

func TestEnterpriseDepartmentTree(t *testing.T) {
	setupEnterprisePostgres(t)
	owner := createEnterpriseTestUser(t, "deptowner", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Dept Co"}))
	ent, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	other := createEnterpriseTestUser(t, "otherowner", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(other.Id, &Enterprise{Name: "Other Co"}))
	otherEnt, err := GetEnterpriseByUserId(other.Id)
	require.NoError(t, err)

	rd := &EnterpriseDepartment{EnterpriseId: ent.Id, Name: "R&D"}
	require.NoError(t, CreateEnterpriseDepartment(rd))
	backend := &EnterpriseDepartment{EnterpriseId: ent.Id, ParentId: rd.Id, Name: "Backend"}
	require.NoError(t, CreateEnterpriseDepartment(backend))

	// 同级重名拒绝；不同父级允许同名
	assert.ErrorIs(t, CreateEnterpriseDepartment(&EnterpriseDepartment{EnterpriseId: ent.Id, ParentId: rd.Id, Name: "Backend"}), ErrEnterpriseDuplicateName)
	require.NoError(t, CreateEnterpriseDepartment(&EnterpriseDepartment{EnterpriseId: ent.Id, Name: "Backend"}))

	// 不能挂到自己的子孙下面，也不能挂到其他企业的部门下面
	assert.ErrorIs(t, UpdateEnterpriseDepartment(ent.Id, rd.Id, "R&D", backend.Id, 0), ErrEnterpriseDepartmentCycle)
	otherDept := &EnterpriseDepartment{EnterpriseId: otherEnt.Id, Name: "Ops"}
	require.NoError(t, CreateEnterpriseDepartment(otherDept))
	assert.ErrorIs(t, CreateEnterpriseDepartment(&EnterpriseDepartment{EnterpriseId: ent.Id, ParentId: otherDept.Id, Name: "X"}), ErrEnterpriseResourceNotFound)

	// 有子部门或员工时不能删除；清空后可删除，删除后同名可重建
	assert.ErrorIs(t, DeleteEnterpriseDepartment(ent.Id, rd.Id), ErrEnterpriseDepartmentInUse)
	employee := &EnterpriseEmployee{EnterpriseId: ent.Id, DepartmentId: backend.Id, Name: "Alice"}
	require.NoError(t, CreateEnterpriseEmployee(employee))
	assert.ErrorIs(t, DeleteEnterpriseDepartment(ent.Id, backend.Id), ErrEnterpriseDepartmentInUse)
	require.NoError(t, DeleteEnterpriseEmployee(ent.Id, employee.Id))
	require.NoError(t, DeleteEnterpriseDepartment(ent.Id, backend.Id))
	require.NoError(t, CreateEnterpriseDepartment(&EnterpriseDepartment{EnterpriseId: ent.Id, ParentId: rd.Id, Name: "Backend"}))
}

func TestEnterpriseTokenAssignmentAndEmployeeLifecycle(t *testing.T) {
	setupEnterprisePostgres(t)
	owner := createEnterpriseTestUser(t, "keyowner", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Key Co"}))
	ent, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	other := createEnterpriseTestUser(t, "keyother", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(other.Id, &Enterprise{Name: "Key Other"}))
	otherEnt, err := GetEnterpriseByUserId(other.Id)
	require.NoError(t, err)

	dept := &EnterpriseDepartment{EnterpriseId: ent.Id, Name: "Sales"}
	require.NoError(t, CreateEnterpriseDepartment(dept))
	alice := &EnterpriseEmployee{EnterpriseId: ent.Id, DepartmentId: dept.Id, Name: "Alice", EmployeeNo: "E001"}
	require.NoError(t, CreateEnterpriseEmployee(alice))
	assert.ErrorIs(t, CreateEnterpriseEmployee(&EnterpriseEmployee{EnterpriseId: ent.Id, Name: "Dup", EmployeeNo: "E001"}), ErrEnterpriseDuplicateName)
	require.NoError(t, CreateEnterpriseEmployee(&EnterpriseEmployee{EnterpriseId: otherEnt.Id, Name: "Same No", EmployeeNo: "E001"}))
	project := &EnterpriseProject{EnterpriseId: ent.Id, Name: "Chatbot"}
	require.NoError(t, CreateEnterpriseProject(project))
	otherEmployee := &EnterpriseEmployee{EnterpriseId: otherEnt.Id, Name: "Mallory"}
	require.NoError(t, CreateEnterpriseEmployee(otherEmployee))

	newToken := func(key string) *Token {
		return &Token{UserId: owner.Id, Name: key, Key: key, Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	}
	aliceKey := newToken("alicekey0000000000000000000000000000000000000001")
	require.NoError(t, CreateEnterpriseToken(ent.Id, aliceKey, alice.Id, project.Id))
	// 不能分配给其他企业的员工；失败时 key 不落库
	strayKey := newToken("straykey0000000000000000000000000000000000000001")
	assert.ErrorIs(t, CreateEnterpriseToken(ent.Id, strayKey, otherEmployee.Id, 0), ErrEnterpriseResourceNotFound)
	var strayCount int64
	require.NoError(t, DB.Model(&Token{}).Where("name = ?", strayKey.Name).Count(&strayCount).Error)
	assert.Equal(t, int64(0), strayCount)
	publicKey := newToken("publickey000000000000000000000000000000000000001")
	require.NoError(t, CreateEnterpriseToken(ent.Id, publicKey, 0, 0))

	items, total, err := ListEnterpriseTokens(ent.Id, owner.Id, EnterpriseTokenFilter{EmployeeId: &alice.Id}, 0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	assert.Equal(t, "Alice", items[0].EmployeeName)
	assert.Equal(t, "Sales", items[0].DepartmentName)
	assert.Equal(t, "Chatbot", items[0].ProjectName)
	assert.NotEqual(t, aliceKey.Key, items[0].Key, "key must be masked")
	unassigned := 0
	_, total, err = ListEnterpriseTokens(ent.Id, owner.Id, EnterpriseTokenFilter{EmployeeId: &unassigned}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)

	// 归属只能指向本企业的 key；归档项目不能再分配
	assert.ErrorIs(t, AssignEnterpriseToken(otherEnt.Id, other.Id, aliceKey.Id, 0, 0), ErrEnterpriseResourceNotFound)
	project.Status = EnterpriseProjectStatusArchived
	require.NoError(t, UpdateEnterpriseProject(project))
	assert.ErrorIs(t, AssignEnterpriseToken(ent.Id, owner.Id, publicKey.Id, 0, project.Id), ErrEnterpriseProjectArchived)

	// 停用员工：名下 key 同步停用，且不能再分配新 key
	alice.Status = EnterpriseEmployeeStatusDisabled
	require.NoError(t, UpdateEnterpriseEmployee(alice))
	stored, err := GetTokenById(aliceKey.Id)
	require.NoError(t, err)
	assert.Equal(t, common.TokenStatusDisabled, stored.Status)
	assert.ErrorIs(t, AssignEnterpriseToken(ent.Id, owner.Id, publicKey.Id, alice.Id, 0), ErrEnterpriseEmployeeNotActive)
	stored, err = GetTokenById(publicKey.Id)
	require.NoError(t, err)
	assert.Equal(t, common.TokenStatusEnabled, stored.Status, "unrelated keys stay enabled")

	// 删除员工后历史归属保留（列表仍能看到员工名）
	require.NoError(t, DeleteEnterpriseEmployee(ent.Id, alice.Id))
	items, _, err = ListEnterpriseTokens(ent.Id, owner.Id, EnterpriseTokenFilter{EmployeeId: &alice.Id}, 0, 20)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, "Alice", items[0].EmployeeName)
	employees, total, err := ListEnterpriseEmployees(ent.Id, EnterpriseEmployeeFilter{}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(0), total)
	assert.Empty(t, employees)
}
