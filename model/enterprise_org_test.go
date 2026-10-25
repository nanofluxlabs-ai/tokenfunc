package model

import (
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// 组织模型 v2：团队 / 成员 / key（PG 实库，夹具见 enterprise_test.go）

func newEnterpriseForTest(t *testing.T, username string, name string) (*User, *Enterprise) {
	t.Helper()
	owner := createEnterpriseTestUser(t, username, common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: name}))
	ent, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	return owner, ent
}

func newEnterpriseTestToken(t *testing.T, ent *Enterprise, ownerId int, key string, teamId int, memberId int) *Token {
	t.Helper()
	token := &Token{UserId: ownerId, Name: key, Key: key, Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, CreateEnterpriseToken(ent.Id, EnterpriseScope{}, token, teamId, memberId))
	return token
}

func TestEnterpriseTeamsAndMembers(t *testing.T) {
	setupEnterprisePostgres(t)
	owner, ent := newEnterpriseForTest(t, "teamowner", "Team Co")
	_, otherEnt := newEnterpriseForTest(t, "teamother", "Other Co")

	// 升级为企业时自动有默认团队；默认团队不可删不可归档
	teams, err := ListEnterpriseTeams(ent.Id, EnterpriseScope{})
	require.NoError(t, err)
	require.Len(t, teams, 1)
	defaultTeam := teams[0]
	assert.True(t, defaultTeam.IsDefault)
	assert.Equal(t, EnterpriseDefaultTeamName, defaultTeam.Name)
	assert.ErrorIs(t, DeleteEnterpriseTeam(ent.Id, defaultTeam.Id), ErrEnterpriseTeamDefault)
	assert.ErrorIs(t, ArchiveEnterpriseTeam(ent.Id, defaultTeam.Id), ErrEnterpriseTeamDefault)

	rd := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "R&D", BudgetAlertPercent: 80}
	require.NoError(t, CreateEnterpriseTeam(rd))
	assert.ErrorIs(t, CreateEnterpriseTeam(&EnterpriseTeam{EnterpriseId: ent.Id, Name: "R&D"}), ErrEnterpriseDuplicateName)
	require.NoError(t, CreateEnterpriseTeam(&EnterpriseTeam{EnterpriseId: otherEnt.Id, Name: "R&D"}), "same name in another enterprise is fine")
	qa := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "QA"}
	require.NoError(t, CreateEnterpriseTeam(qa))
	assert.Error(t, UpdateEnterpriseTeam(&EnterpriseTeam{Id: rd.Id, EnterpriseId: ent.Id, Name: "R&D", BudgetAlertPercent: 150}), "alert percent must be 0..99")

	// 成员：team_id=0 落默认团队；工号企业内唯一；团队必须属于本企业
	alice := &EnterpriseMember{EnterpriseId: ent.Id, TeamId: rd.Id, Name: "Alice", EmployeeNo: "E001"}
	require.NoError(t, CreateEnterpriseMember(alice))
	bob := &EnterpriseMember{EnterpriseId: ent.Id, Name: "Bob"}
	require.NoError(t, CreateEnterpriseMember(bob))
	assert.Equal(t, defaultTeam.Id, bob.TeamId)
	assert.ErrorIs(t, CreateEnterpriseMember(&EnterpriseMember{EnterpriseId: ent.Id, Name: "Dup", EmployeeNo: "E001"}), ErrEnterpriseDuplicateName)
	assert.ErrorIs(t, CreateEnterpriseMember(&EnterpriseMember{EnterpriseId: ent.Id, TeamId: 424242, Name: "Ghost"}), ErrEnterpriseResourceNotFound)

	// key：持有人必须属于目标团队；失败时 key 不落库；有成员的团队不能删除
	aliceKey := newEnterpriseTestToken(t, ent, owner.Id, "alicekey0000000000000000000000000000000000000001", rd.Id, alice.Id)
	strayKey := &Token{UserId: owner.Id, Name: "stray", Key: "straykey0000000000000000000000000000000000000001", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	assert.ErrorIs(t, CreateEnterpriseToken(ent.Id, EnterpriseScope{}, strayKey, qa.Id, alice.Id), ErrEnterpriseMemberTeamMismatch)
	var strayCount int64
	require.NoError(t, DB.Model(&Token{}).Where("name = ?", "stray").Count(&strayCount).Error)
	assert.Equal(t, int64(0), strayCount)
	publicKey := newEnterpriseTestToken(t, ent, owner.Id, "publickey000000000000000000000000000000000000001", 0, 0)
	assignment, err := GetEnterpriseTokenAssignment(publicKey.Id)
	require.NoError(t, err)
	assert.Equal(t, defaultTeam.Id, assignment.TeamId, "team key without explicit team falls into the default team")
	assert.ErrorIs(t, DeleteEnterpriseTeam(ent.Id, rd.Id), ErrEnterpriseTeamInUse)

	// 成员换团队：其 key 的团队跟着走
	alice.TeamId = qa.Id
	require.NoError(t, UpdateEnterpriseMember(alice))
	assignment, err = GetEnterpriseTokenAssignment(aliceKey.Id)
	require.NoError(t, err)
	assert.Equal(t, qa.Id, assignment.TeamId)

	// 停用成员：名下 key 同步停用，且不能再分配新 key；其它 key 不受影响
	alice.Status = EnterpriseMemberStatusDisabled
	require.NoError(t, UpdateEnterpriseMember(alice))
	stored, err := GetTokenById(aliceKey.Id)
	require.NoError(t, err)
	assert.Equal(t, common.TokenStatusDisabled, stored.Status)
	assert.ErrorIs(t, AssignEnterpriseToken(ent.Id, owner.Id, EnterpriseScope{}, publicKey.Id, qa.Id, alice.Id), ErrEnterpriseMemberNotActive)
	stored, err = GetTokenById(publicKey.Id)
	require.NoError(t, err)
	assert.Equal(t, common.TokenStatusEnabled, stored.Status)

	// 归档团队：不能再建 key；删除成员后历史归属保留在 key 列表里
	require.NoError(t, ArchiveEnterpriseTeam(ent.Id, qa.Id))
	lateKey := &Token{UserId: owner.Id, Name: "late", Key: "latekey00000000000000000000000000000000000000001", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	assert.ErrorIs(t, CreateEnterpriseToken(ent.Id, EnterpriseScope{}, lateKey, qa.Id, 0), ErrEnterpriseTeamArchived)
	require.NoError(t, DeleteEnterpriseMember(ent.Id, alice.Id))
	items, _, err := ListEnterpriseTokens(ent.Id, owner.Id, EnterpriseScope{}, EnterpriseTokenFilter{MemberId: &alice.Id}, 0, 20)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, "Alice", items[0].MemberName)
	assert.Equal(t, "QA", items[0].TeamName)
	assert.NotEqual(t, aliceKey.Key, items[0].Key, "key must be masked")
	members, total, err := ListEnterpriseMembers(ent.Id, EnterpriseScope{}, EnterpriseMemberFilter{}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "Bob", members[0].Name)
	assert.Equal(t, EnterpriseDefaultTeamName, members[0].TeamName)
}

func TestEnterpriseScopeIsolation(t *testing.T) {
	setupEnterprisePostgres(t)
	owner, ent := newEnterpriseForTest(t, "scopeowner", "Scope Co")
	rd := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "R&D"}
	require.NoError(t, CreateEnterpriseTeam(rd))
	qa := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "QA"}
	require.NoError(t, CreateEnterpriseTeam(qa))
	rdMember := &EnterpriseMember{EnterpriseId: ent.Id, TeamId: rd.Id, Name: "Rd"}
	require.NoError(t, CreateEnterpriseMember(rdMember))
	qaMember := &EnterpriseMember{EnterpriseId: ent.Id, TeamId: qa.Id, Name: "Qa"}
	require.NoError(t, CreateEnterpriseMember(qaMember))
	rdKey := newEnterpriseTestToken(t, ent, owner.Id, "rdkey00000000000000000000000000000000000000000001", rd.Id, rdMember.Id)
	qaKey := newEnterpriseTestToken(t, ent, owner.Id, "qakey00000000000000000000000000000000000000000001", qa.Id, 0)

	rdScope := EnterpriseScope{TeamId: &rd.Id}
	teams, err := ListEnterpriseTeams(ent.Id, rdScope)
	require.NoError(t, err)
	require.Len(t, teams, 1)
	assert.Equal(t, "R&D", teams[0].Name)
	assert.Equal(t, 1, teams[0].MemberCount)
	assert.Equal(t, 1, teams[0].TokenCount)
	members, total, err := ListEnterpriseMembers(ent.Id, rdScope, EnterpriseMemberFilter{}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "Rd", members[0].Name)
	_, err = GetEnterpriseMember(ent.Id, qaMember.Id, rdScope)
	assert.ErrorIs(t, err, ErrEnterpriseResourceNotFound)
	keys, total, err := ListEnterpriseTokens(ent.Id, owner.Id, rdScope, EnterpriseTokenFilter{}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, rdKey.Id, keys[0].Id)
	// 概览计数与密钥页筛选同一派生口径：QA 的 key 余额归零但 tokens.status 仍为启用，既计入耗尽、也能按耗尽筛出
	require.NoError(t, DB.Model(&Token{}).Where("id = ?", qaKey.Id).Updates(map[string]any{"unlimited_quota": false, "remain_quota": 0}).Error)
	counts, err := CountEnterpriseTokens(ent.Id, owner.Id, EnterpriseScope{}, common.GetTimestamp())
	require.NoError(t, err)
	assert.Equal(t, &EnterpriseTokenCounts{Total: 2, Active: 1, Exhausted: 1}, counts)
	exhaustedStatus := common.TokenStatusExhausted
	keys, total, err = ListEnterpriseTokens(ent.Id, owner.Id, EnterpriseScope{}, EnterpriseTokenFilter{Status: &exhaustedStatus}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, qaKey.Id, keys[0].Id)
	assert.Equal(t, common.TokenStatusEnabled, keys[0].Status)
	assert.Equal(t, common.TokenStatusExhausted, keys[0].EffectiveStatus)
	// 范围内不能把 key 挪到别的团队，也不能动别的团队的 key，更不能在别的团队建 key
	assert.ErrorIs(t, AssignEnterpriseToken(ent.Id, owner.Id, rdScope, rdKey.Id, qa.Id, 0), ErrEnterpriseResourceNotFound)
	assert.ErrorIs(t, AssignEnterpriseToken(ent.Id, owner.Id, rdScope, qaKey.Id, rd.Id, 0), ErrEnterpriseResourceNotFound)
	foreign := &Token{UserId: owner.Id, Name: "x", Key: "xkey000000000000000000000000000000000000000000001", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	assert.ErrorIs(t, CreateEnterpriseToken(ent.Id, rdScope, foreign, qa.Id, 0), ErrEnterpriseResourceNotFound)
	// 导入：范围内只能落本团队
	result, err := ImportEnterpriseMembers(ent.Id, rdScope, []EnterpriseMemberImportRow{{Name: "A"}, {Name: "B", Team: "QA"}})
	require.NoError(t, err)
	assert.Equal(t, 0, result.Created)
	require.Len(t, result.Errors, 1)
	assert.Equal(t, 2, result.Errors[0].Row)
	result, err = ImportEnterpriseMembers(ent.Id, rdScope, []EnterpriseMemberImportRow{{Name: "A"}, {Name: "B", Team: "r&d"}})
	require.NoError(t, err)
	assert.Equal(t, 2, result.Created)
	_, total, err = ListEnterpriseMembers(ent.Id, rdScope, EnterpriseMemberFilter{}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
}

func TestEnterpriseMemberLoginAndAccess(t *testing.T) {
	setupEnterprisePostgres(t)
	owner, ent := newEnterpriseForTest(t, "loginowner", "Login Co")
	_, otherEnt := newEnterpriseForTest(t, "loginother", "Login Other")
	rd := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "R&D"}
	require.NoError(t, CreateEnterpriseTeam(rd))
	alice := &EnterpriseMember{EnterpriseId: ent.Id, TeamId: rd.Id, Name: "Alice", Email: "alice@example.com"}
	require.NoError(t, CreateEnterpriseMember(alice))
	carol := &EnterpriseMember{EnterpriseId: ent.Id, Name: "Carol"}
	require.NoError(t, CreateEnterpriseMember(carol))
	otherMember := &EnterpriseMember{EnterpriseId: otherEnt.Id, Name: "Mallory"}
	require.NoError(t, CreateEnterpriseMember(otherMember))

	// 主账号本身就是企业身份，范围是全企业
	gotEnt, actor, err := GetEnterpriseAccess(owner.Id)
	require.NoError(t, err)
	assert.Equal(t, ent.Id, gotEnt.Id)
	assert.True(t, actor.IsOwner)
	assert.Nil(t, actor.Scope().TeamId)

	// 可绑定的账号：普通、已启用、不是任何企业的主账号；按用户名或邮箱精确匹配
	dev := createEnterpriseTestUser(t, "devuser", common.RoleCommonUser)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", dev.Id).Update("email", "Dev@Example.com").Error)
	_, err = FindUserForEnterpriseLogin("loginother")
	assert.ErrorIs(t, err, ErrEnterpriseLoginUserInvalid, "an enterprise owner cannot be a member")
	admin := createEnterpriseTestUser(t, "platformadmin", common.RoleAdminUser)
	_, err = FindUserForEnterpriseLogin(admin.Username)
	assert.ErrorIs(t, err, ErrEnterpriseLoginUserInvalid)
	_, err = FindUserForEnterpriseLogin("nobody-here")
	assert.ErrorIs(t, err, ErrEnterpriseResourceNotFound)
	found, err := FindUserForEnterpriseLogin("dev@example.com")
	require.NoError(t, err)
	assert.Equal(t, dev.Id, found.Id)

	_, _, err = GetEnterpriseAccess(dev.Id)
	assert.ErrorIs(t, err, ErrEnterpriseNoAccess, "unbound user has no access")
	assert.ErrorIs(t, BindEnterpriseMemberLogin(ent.Id, alice.Id, found, "boss"), ErrEnterpriseInvalidRole)
	require.NoError(t, BindEnterpriseMemberLogin(ent.Id, alice.Id, found, EnterpriseMemberRoleTeamAdmin))
	assert.ErrorIs(t, BindEnterpriseMemberLogin(ent.Id, alice.Id, found, EnterpriseMemberRoleDeveloper), ErrEnterpriseMemberHasLogin)
	assert.ErrorIs(t, BindEnterpriseMemberLogin(otherEnt.Id, otherMember.Id, found, EnterpriseMemberRoleDeveloper), ErrEnterpriseLoginUserTaken, "one account belongs to one member")

	gotEnt, actor, err = GetEnterpriseAccess(dev.Id)
	require.NoError(t, err)
	assert.Equal(t, ent.Id, gotEnt.Id)
	assert.False(t, actor.IsOwner)
	assert.Equal(t, EnterpriseMemberRoleTeamAdmin, actor.Role)
	assert.Equal(t, alice.Id, actor.MemberId)
	require.NotNil(t, actor.Scope().TeamId)
	assert.Equal(t, rd.Id, *actor.Scope().TeamId)
	assert.True(t, actor.AtLeast(EnterpriseMemberRoleDeveloper))
	assert.False(t, actor.AtLeast(EnterpriseMemberRoleEnterpriseAdmin))

	// 改角色：没有登录账号的成员不能设角色；企业管理员看全企业
	assert.ErrorIs(t, SetEnterpriseMemberRole(ent.Id, carol.Id, EnterpriseMemberRoleDeveloper), ErrEnterpriseMemberNoLogin)
	require.NoError(t, SetEnterpriseMemberRole(ent.Id, alice.Id, EnterpriseMemberRoleEnterpriseAdmin))
	_, actor, err = GetEnterpriseAccess(dev.Id)
	require.NoError(t, err)
	assert.Nil(t, actor.Scope().TeamId)

	// 一键开通：普通用户、余额 0、不送新人额度、标记 provisioned；解绑后账号停用、失去入口
	previousQuotaForNewUser := common.QuotaForNewUser
	common.QuotaForNewUser = 5000
	t.Cleanup(func() { common.QuotaForNewUser = previousQuotaForNewUser })
	login, err := ProvisionEnterpriseMemberLogin(ent.Id, carol.Id, EnterpriseMemberRoleDeveloper)
	require.NoError(t, err)
	assert.NotEmpty(t, login.Password)
	assert.Contains(t, login.Username, "member-e")
	provisioned, err := GetUserById(login.UserId, true)
	require.NoError(t, err)
	assert.Equal(t, common.RoleCommonUser, provisioned.Role)
	assert.Equal(t, 0, provisioned.Quota)
	assert.Equal(t, "Carol", provisioned.DisplayName)
	_, actor, err = GetEnterpriseAccess(login.UserId)
	require.NoError(t, err)
	assert.True(t, actor.Provisioned)
	assert.Equal(t, EnterpriseMemberRoleDeveloper, actor.Role)
	_, err = ProvisionEnterpriseMemberLogin(ent.Id, carol.Id, EnterpriseMemberRoleDeveloper)
	assert.ErrorIs(t, err, ErrEnterpriseMemberHasLogin)

	require.NoError(t, UnbindEnterpriseMemberLogin(ent.Id, carol.Id))
	_, _, err = GetEnterpriseAccess(login.UserId)
	assert.ErrorIs(t, err, ErrEnterpriseNoAccess)
	provisioned, err = GetUserById(login.UserId, true)
	require.NoError(t, err)
	assert.Equal(t, common.UserStatusDisabled, provisioned.Status, "provisioned account is disabled on unbind")
	assert.ErrorIs(t, UnbindEnterpriseMemberLogin(ent.Id, carol.Id), ErrEnterpriseMemberNoLogin)

	// 解绑后再次一键开通：复用被停用的旧账号（用户名 / 邮箱仍被它占着），重置密码并重新启用
	relogin, err := ProvisionEnterpriseMemberLogin(ent.Id, carol.Id, EnterpriseMemberRoleTeamAdmin)
	require.NoError(t, err)
	assert.Equal(t, login.UserId, relogin.UserId)
	assert.Equal(t, login.Username, relogin.Username)
	assert.NotEqual(t, login.Password, relogin.Password)
	provisioned, err = GetUserById(login.UserId, true)
	require.NoError(t, err)
	assert.Equal(t, common.UserStatusEnabled, provisioned.Status)
	assert.True(t, common.ValidatePasswordAndHash(relogin.Password, provisioned.Password), "new password is usable")
	assert.False(t, common.ValidatePasswordAndHash(login.Password, provisioned.Password), "old password is gone")
	_, actor, err = GetEnterpriseAccess(login.UserId)
	require.NoError(t, err)
	assert.True(t, actor.Provisioned)
	assert.Equal(t, EnterpriseMemberRoleTeamAdmin, actor.Role)
	require.NoError(t, UnbindEnterpriseMemberLogin(ent.Id, carol.Id))

	// 绑定的已有账号被解绑时不动账号本身；停用成员后其登录入口失效
	require.NoError(t, UnbindEnterpriseMemberLogin(ent.Id, alice.Id))
	devUser, err := GetUserById(dev.Id, true)
	require.NoError(t, err)
	assert.Equal(t, common.UserStatusEnabled, devUser.Status)
	require.NoError(t, BindEnterpriseMemberLogin(ent.Id, alice.Id, found, EnterpriseMemberRoleDeveloper))
	alice.Status = EnterpriseMemberStatusDisabled
	require.NoError(t, UpdateEnterpriseMember(alice))
	_, _, err = GetEnterpriseAccess(dev.Id)
	assert.ErrorIs(t, err, ErrEnterpriseNoAccess)
}

func TestEnterpriseMemberImportIsAllOrNothing(t *testing.T) {
	setupEnterprisePostgres(t)
	_, ent := newEnterpriseForTest(t, "importowner", "Import Co")
	require.NoError(t, CreateEnterpriseTeam(&EnterpriseTeam{EnterpriseId: ent.Id, Name: "Sales"}))
	require.NoError(t, CreateEnterpriseMember(&EnterpriseMember{EnterpriseId: ent.Id, Name: "Existing", EmployeeNo: "E100"}))

	// 一行有错（工号与库中重复、文件内重复、缺姓名）→ 整批拒绝，不新建任何成员或团队
	result, err := ImportEnterpriseMembers(ent.Id, EnterpriseScope{}, []EnterpriseMemberImportRow{
		{Name: "Alice", EmployeeNo: "E100", Team: "sales"},
		{Name: "Bob", EmployeeNo: "E101", Team: "New Team"},
		{Name: "Carol", EmployeeNo: "E101"},
		{Name: " "},
	})
	require.NoError(t, err)
	assert.Equal(t, 0, result.Created)
	rows := make([]int, 0, len(result.Errors))
	for _, importError := range result.Errors {
		rows = append(rows, importError.Row)
	}
	assert.Equal(t, []int{1, 3, 4}, rows)
	_, total, err := ListEnterpriseMembers(ent.Id, EnterpriseScope{}, EnterpriseMemberFilter{}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	teams, err := ListEnterpriseTeams(ent.Id, EnterpriseScope{})
	require.NoError(t, err)
	assert.Len(t, teams, 2, "default + Sales")

	// 全部合法：团队按名称（不区分大小写）匹配，缺失的新建，留空落默认团队
	result, err = ImportEnterpriseMembers(ent.Id, EnterpriseScope{}, []EnterpriseMemberImportRow{
		{Name: "Alice", Email: "alice@x.com", EmployeeNo: "E201", Team: "SALES"},
		{Name: "Bob", Team: "New Team"},
		{Name: "Carol", Team: "new team"},
		{Name: "Dave"},
	})
	require.NoError(t, err)
	assert.Empty(t, result.Errors)
	assert.Equal(t, 4, result.Created)
	assert.Equal(t, []string{"New Team"}, result.CreatedTeams)
	teams, err = ListEnterpriseTeams(ent.Id, EnterpriseScope{})
	require.NoError(t, err)
	assert.Len(t, teams, 3)
	items, total, err := ListEnterpriseMembers(ent.Id, EnterpriseScope{}, EnterpriseMemberFilter{Keyword: "alice"}, 0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	assert.Equal(t, "Sales", items[0].TeamName)
	items, _, err = ListEnterpriseMembers(ent.Id, EnterpriseScope{}, EnterpriseMemberFilter{Keyword: "dave"}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, EnterpriseDefaultTeamName, items[0].TeamName)
	hasLogin := false
	_, total, err = ListEnterpriseMembers(ent.Id, EnterpriseScope{}, EnterpriseMemberFilter{HasLogin: &hasLogin}, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
}

func TestEnterpriseUsageAggregationSnapshotsAttribution(t *testing.T) {
	setupEnterprisePostgres(t)
	owner, ent := newEnterpriseForTest(t, "usageowner", "Usage Co")
	sales := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "Sales"}
	require.NoError(t, CreateEnterpriseTeam(sales))
	ops := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "Ops"}
	require.NoError(t, CreateEnterpriseTeam(ops))
	alice := &EnterpriseMember{EnterpriseId: ent.Id, TeamId: sales.Id, Name: "Alice"}
	require.NoError(t, CreateEnterpriseMember(alice))
	token := newEnterpriseTestToken(t, ent, owner.Id, "alicekey0000000000000000000000000000000000000002", sales.Id, alice.Id)
	InvalidateEnterpriseBillingInfo(owner.Id)

	now := common.GetTimestamp()
	event := EnterpriseUsageEvent{UserId: owner.Id, TokenId: token.Id, ModelName: "gpt-4o", PromptTokens: 100, CompletionTokens: 50, CacheTokens: 30, CacheCreationTokens: 5, Quota: 7, CreatedAt: now}
	require.NoError(t, RecordEnterpriseUsage(event))
	require.NoError(t, RecordEnterpriseUsage(event))
	// 非企业用户不写任何东西
	require.NoError(t, RecordEnterpriseUsage(EnterpriseUsageEvent{UserId: 424242, TokenId: 1, ModelName: "x", CreatedAt: now}))

	from, to := DefaultEnterpriseUsageRange()
	byMember, err := SummarizeEnterpriseUsage(ent.Id, EnterpriseUsageGroupMember, from, to, EnterpriseUsageFilter{})
	require.NoError(t, err)
	require.Len(t, byMember, 1)
	assert.Equal(t, "Alice", byMember[0].KeyName)
	assert.Equal(t, int64(2), byMember[0].RequestCount)
	assert.Equal(t, int64(200), byMember[0].PromptTokens)
	assert.Equal(t, int64(60), byMember[0].CacheTokens)
	assert.Equal(t, int64(10), byMember[0].CacheCreationTokens)
	assert.Equal(t, int64(14), byMember[0].Quota)

	// 成员换团队后：历史仍归 Sales，新用量归 Ops（写入时快照）
	alice.TeamId = ops.Id
	require.NoError(t, UpdateEnterpriseMember(alice))
	require.NoError(t, RecordEnterpriseUsage(EnterpriseUsageEvent{UserId: owner.Id, TokenId: token.Id, ModelName: "gpt-4o", Quota: 3, CreatedAt: now}))
	byTeam, err := SummarizeEnterpriseUsage(ent.Id, EnterpriseUsageGroupTeam, from, to, EnterpriseUsageFilter{})
	require.NoError(t, err)
	totals := map[string]int64{}
	for _, item := range byTeam {
		totals[item.KeyName] = item.Quota
	}
	assert.Equal(t, map[string]int64{"Sales": 14, "Ops": 3}, totals)

	// 下钻过滤与范围：按团队过滤只看该团队；范围并入过滤
	scoped, err := SummarizeEnterpriseUsage(ent.Id, EnterpriseUsageGroupToken, from, to, EnterpriseUsageFilter{}.WithScope(EnterpriseScope{TeamId: &ops.Id}))
	require.NoError(t, err)
	require.Len(t, scoped, 1)
	assert.Equal(t, int64(3), scoped[0].Quota)
	total, err := SumEnterpriseUsageTotal(ent.Id, from, to, EnterpriseUsageFilter{MemberId: &alice.Id})
	require.NoError(t, err)
	assert.Equal(t, int64(17), total.Quota)
	// 成员列表的本月消耗按 member_id 快照汇总，与换团队无关
	members, _, err := ListEnterpriseMembers(ent.Id, EnterpriseScope{}, EnterpriseMemberFilter{Keyword: "alice"}, 0, 20)
	require.NoError(t, err)
	require.Len(t, members, 1)
	assert.Equal(t, int64(17), members[0].MonthQuota)
	byToken, err := SumEnterpriseUsageByColumn(ent.Id, "token_id", []int{token.Id, 999}, from, to)
	require.NoError(t, err)
	assert.Equal(t, map[int]int64{token.Id: 17}, byToken)
	_, err = SumEnterpriseUsageByColumn(ent.Id, "day", []int{1}, from, to)
	assert.Error(t, err)

	// 其它维度与导出
	byModel, err := SummarizeEnterpriseUsage(ent.Id, EnterpriseUsageGroupModel, from, to, EnterpriseUsageFilter{})
	require.NoError(t, err)
	require.Len(t, byModel, 1)
	assert.Equal(t, "gpt-4o", byModel[0].KeyName)
	assert.Equal(t, int64(17), byModel[0].Quota)
	_, err = SummarizeEnterpriseUsage(ent.Id, "department", from, to, EnterpriseUsageFilter{})
	assert.ErrorIs(t, err, ErrEnterpriseUsageGroup)
	rows, err := ExportEnterpriseUsage(ent.Id, from, to, EnterpriseUsageFilter{})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, token.Name, rows[0].TokenName)
	assert.Equal(t, int64(17), rows[0].Quota+rows[1].Quota)
	assert.Equal(t, int64(60), rows[0].CacheTokens+rows[1].CacheTokens)

	// 授信企业按账期归因；账期明细合计可用于出账对账
	require.NoError(t, ConfigureEnterpriseCredit(ent.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleNaturalMonth, LimitQuota: 1000}, 1))
	period, err := GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	require.NoError(t, RecordEnterpriseUsage(EnterpriseUsageEvent{UserId: owner.Id, TokenId: token.Id, ModelName: "gpt-4o", Quota: 5, CreatedAt: now, CreditPeriodId: period.Id}))
	periodTotal, err := SumEnterpriseUsageByPeriod(ent.Id, period.Id)
	require.NoError(t, err)
	assert.Equal(t, int64(5), periodTotal)
	assert.NoError(t, ValidateEnterpriseUsageDay("2026-10-09"))
	assert.Error(t, ValidateEnterpriseUsageDay("2026/10/09"))
}

// TestEnterpriseOrgV2Migration 从旧结构（部门树 / 员工 / 项目 / 旧聚合表）迁移到团队 / 成员：幂等、数据不丢
func TestEnterpriseOrgV2Migration(t *testing.T) {
	setupEnterprisePostgres(t)
	owner := createEnterpriseTestUser(t, "migowner", common.RoleCommonUser)
	t.Cleanup(func() { _ = DB.Exec("DROP TABLE IF EXISTS ent_usage_daily_legacy").Error })
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Mig Co"}))
	ent, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)

	// 清掉新表，按旧版 GORM 结构建旧表并灌数据：部门树 R&D > Backend、Sales，员工 alice(Backend) / bob(无部门)，项目 Bot
	require.NoError(t, DB.Migrator().DropTable(&EnterpriseTeam{}, &EnterpriseMember{}, &EnterpriseTokenAssignment{}, &EnterpriseUsageDaily{}))
	for _, stmt := range []string{
		`CREATE TABLE ent_departments (id bigserial PRIMARY KEY, enterprise_id bigint NOT NULL, parent_id bigint NOT NULL DEFAULT 0, name varchar(64) NOT NULL, sort bigint NOT NULL DEFAULT 0, created_at bigint NOT NULL, updated_at bigint NOT NULL, deleted_at timestamptz)`,
		`CREATE UNIQUE INDEX uk_ent_dept_name ON ent_departments (enterprise_id, parent_id, name) WHERE deleted_at IS NULL`,
		`CREATE INDEX idx_ent_dept_parent ON ent_departments (enterprise_id, parent_id)`,
		`CREATE INDEX idx_ent_departments_deleted_at ON ent_departments (deleted_at)`,
		`CREATE TABLE ent_employees (id bigserial PRIMARY KEY, enterprise_id bigint NOT NULL, department_id bigint NOT NULL DEFAULT 0, name varchar(64) NOT NULL, email varchar(128) NOT NULL DEFAULT '', employee_no varchar(64) NOT NULL DEFAULT '', status varchar(16) NOT NULL, remark text, created_at bigint NOT NULL, updated_at bigint NOT NULL, deleted_at timestamptz)`,
		`CREATE UNIQUE INDEX uk_ent_employee_no ON ent_employees (enterprise_id, employee_no) WHERE employee_no <> '' AND deleted_at IS NULL`,
		`CREATE INDEX idx_ent_employees_department_id ON ent_employees (department_id)`,
		`CREATE TABLE ent_projects (id bigserial PRIMARY KEY, enterprise_id bigint NOT NULL, name varchar(64) NOT NULL, code varchar(64) NOT NULL DEFAULT '', status varchar(16) NOT NULL, remark text, created_at bigint NOT NULL, updated_at bigint NOT NULL, deleted_at timestamptz)`,
		`CREATE TABLE ent_token_assignments (token_id bigint PRIMARY KEY, enterprise_id bigint NOT NULL, employee_id bigint NOT NULL DEFAULT 0, project_id bigint NOT NULL DEFAULT 0, created_at bigint NOT NULL, updated_at bigint NOT NULL)`,
		`CREATE INDEX idx_ent_token_assignments_employee_id ON ent_token_assignments (employee_id)`,
		`CREATE TABLE ent_usage_daily (day varchar(10) NOT NULL, enterprise_id bigint NOT NULL, token_id bigint NOT NULL, model_name varchar(128) NOT NULL, period_id bigint NOT NULL, employee_id bigint NOT NULL, department_id bigint NOT NULL, project_id bigint NOT NULL, request_count bigint NOT NULL DEFAULT 0, prompt_tokens bigint NOT NULL DEFAULT 0, completion_tokens bigint NOT NULL DEFAULT 0, quota bigint NOT NULL DEFAULT 0, updated_at bigint NOT NULL, PRIMARY KEY (day, enterprise_id, token_id, model_name, period_id, employee_id, department_id, project_id))`,
		`CREATE INDEX idx_ent_usage_enterprise_day ON ent_usage_daily (enterprise_id, day)`,
	} {
		require.NoError(t, DB.Exec(stmt).Error, stmt)
	}
	now := common.GetTimestamp()
	require.NoError(t, DB.Exec(`INSERT INTO ent_departments (id, enterprise_id, parent_id, name, created_at, updated_at) VALUES (1, ?, 0, 'R&D', ?, ?), (2, ?, 1, 'Backend', ?, ?), (3, ?, 0, 'Sales', ?, ?)`,
		ent.Id, now, now, ent.Id, now, now, ent.Id, now, now).Error)
	require.NoError(t, DB.Exec(`INSERT INTO ent_employees (id, enterprise_id, department_id, name, status, created_at, updated_at) VALUES (1, ?, 2, 'alice', 'active', ?, ?), (2, ?, 0, 'bob', 'active', ?, ?)`,
		ent.Id, now, now, ent.Id, now, now).Error)
	require.NoError(t, DB.Exec(`INSERT INTO ent_projects (id, enterprise_id, name, status, created_at, updated_at) VALUES (1, ?, 'Bot', 'active', ?, ?)`, ent.Id, now, now).Error)
	// 手工指定了 id，要把序列推过去，否则迁移时新建默认团队会撞主键
	require.NoError(t, DB.Exec("SELECT setval(pg_get_serial_sequence('ent_departments', 'id'), 10)").Error)
	require.NoError(t, DB.Exec("SELECT setval(pg_get_serial_sequence('ent_employees', 'id'), 10)").Error)
	for _, key := range []string{"migkey0000000000000000000000000000000000000000001", "migkey0000000000000000000000000000000000000000002", "migkey0000000000000000000000000000000000000000003"} {
		require.NoError(t, DB.Create(&Token{UserId: owner.Id, Name: key, Key: key, Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}).Error)
	}
	var tokenIds []int
	require.NoError(t, DB.Model(&Token{}).Where("user_id = ?", owner.Id).Order("id ASC").Pluck("id", &tokenIds).Error)
	require.Len(t, tokenIds, 3)
	// key1 归 alice+Bot，key2 只归项目 Bot，key3 没有归属行（主账号在上游页建的）
	require.NoError(t, DB.Exec(`INSERT INTO ent_token_assignments (token_id, enterprise_id, employee_id, project_id, created_at, updated_at) VALUES (?, ?, 1, 1, ?, ?), (?, ?, 0, 1, ?, ?)`,
		tokenIds[0], ent.Id, now, now, tokenIds[1], ent.Id, now, now).Error)
	require.NoError(t, DB.Exec(`INSERT INTO ent_usage_daily (day, enterprise_id, token_id, model_name, period_id, employee_id, department_id, project_id, request_count, prompt_tokens, completion_tokens, quota, updated_at) VALUES
		('2026-10-01', ?, ?, 'gpt-4o', 0, 1, 2, 1, 2, 100, 50, 7, ?),
		('2026-10-01', ?, ?, 'gpt-4o', 0, 1, 2, 0, 1, 10, 5, 3, ?),
		('2026-10-02', ?, ?, 'gpt-4o', 0, 0, 0, 1, 4, 40, 20, 9, ?)`,
		ent.Id, tokenIds[0], now, ent.Id, tokenIds[0], now, ent.Id, tokenIds[1], now).Error)

	runMigration := func() {
		require.NoError(t, migrateEnterpriseOrgV2Before())
		require.NoError(t, DB.AutoMigrate(&EnterpriseTeam{}, &EnterpriseMember{}, &EnterpriseTokenAssignment{}, &EnterpriseUsageDaily{}))
		require.NoError(t, migrateEnterpriseOrgV2After())
	}
	runMigration()
	runMigration() // 幂等

	assert.False(t, DB.Migrator().HasTable("ent_departments"))
	assert.False(t, DB.Migrator().HasTable("ent_employees"))
	assert.False(t, DB.Migrator().HasTable("ent_projects"))
	teams, err := ListEnterpriseTeams(ent.Id, EnterpriseScope{})
	require.NoError(t, err)
	names := map[string]*EnterpriseTeamListItem{}
	for _, team := range teams {
		names[team.Name] = team
	}
	require.Len(t, names, 4, "Default + R&D + R&D / Backend + Sales")
	assert.True(t, names[EnterpriseDefaultTeamName].IsDefault)
	require.Contains(t, names, "R&D / Backend")
	members, _, err := ListEnterpriseMembers(ent.Id, EnterpriseScope{}, EnterpriseMemberFilter{}, 0, 20)
	require.NoError(t, err)
	byName := map[string]*EnterpriseMemberListItem{}
	for _, member := range members {
		byName[member.Name] = member
	}
	assert.Equal(t, names["R&D / Backend"].Id, byName["alice"].TeamId)
	assert.Equal(t, names[EnterpriseDefaultTeamName].Id, byName["bob"].TeamId, "members without a department land in the default team")
	assert.Equal(t, EnterpriseMemberRoleNone, byName["alice"].Role)
	for i, expectedTeam := range []int{names["R&D / Backend"].Id, names[EnterpriseDefaultTeamName].Id, names[EnterpriseDefaultTeamName].Id} {
		assignment, err := GetEnterpriseTokenAssignment(tokenIds[i])
		require.NoError(t, err)
		require.NotNil(t, assignment, "every owner key gets an assignment")
		assert.Equal(t, expectedTeam, assignment.TeamId, "token %d", i+1)
	}
	assignment, err := GetEnterpriseTokenAssignment(tokenIds[0])
	require.NoError(t, err)
	assert.Equal(t, 1, assignment.MemberId)
	// 聚合：按新主键合并（key1 两行同 day 合并为一行），department 0 → 默认团队，总额不变
	byTeam, err := SummarizeEnterpriseUsage(ent.Id, EnterpriseUsageGroupTeam, "2026-10-01", "2026-10-02", EnterpriseUsageFilter{})
	require.NoError(t, err)
	teamTotals := map[string]int64{}
	for _, item := range byTeam {
		teamTotals[item.KeyName] = item.Quota
	}
	assert.Equal(t, map[string]int64{"R&D / Backend": 10, EnterpriseDefaultTeamName: 9}, teamTotals)
	var rowCount int64
	require.NoError(t, DB.Model(&EnterpriseUsageDaily{}).Count(&rowCount).Error)
	assert.Equal(t, int64(2), rowCount)
	assert.True(t, DB.Migrator().HasTable("ent_usage_daily_legacy"), "legacy table is kept for one release")
	assert.False(t, columnExists("ent_usage_daily_legacy", "department_id"), "legacy table is marked as migrated")
}

// TestEnterpriseTeamBudgetAlertsAndState 团队月度预算：跨阈值每月每档只发一次、并发只一方抢到、上调预算后可再触发、列表回填状态
func TestEnterpriseTeamBudgetAlertsAndState(t *testing.T) {
	setupEnterprisePostgres(t)
	owner, ent := newEnterpriseForTest(t, "budgetowner", "Budget Co")
	team := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "Research", MonthlyBudgetQuota: 1000, BudgetAlertPercent: 80}
	require.NoError(t, CreateEnterpriseTeam(team))
	token := newEnterpriseTestToken(t, ent, owner.Id, "budgetkey000000000000000000000000000000000000001", team.Id, 0)
	InvalidateEnterpriseBillingInfo(owner.Id)
	// 表重建后 token id 会复用，前一个用例的归属缓存（30 秒）必须清掉
	InvalidateAllTokenAttribution()
	InvalidateTeamMonthUsage(team.Id)
	teamBudgetNotified.Range(func(key, _ any) bool { teamBudgetNotified.Delete(key); return true })

	var alerts []TeamBudgetAlert
	previousSender := TeamBudgetAlertSender
	TeamBudgetAlertSender = func(alert TeamBudgetAlert) { alerts = append(alerts, alert) }
	t.Cleanup(func() { TeamBudgetAlertSender = previousSender })

	record := func(quota int) {
		t.Helper()
		require.NoError(t, RecordEnterpriseUsage(EnterpriseUsageEvent{UserId: owner.Id, TokenId: token.Id, ModelName: "gpt-4o", Quota: quota, CreatedAt: common.GetTimestamp()}))
	}
	month := EnterpriseBudgetMonth(time.Now())

	// 700 未到阈值；800 跨过 80% 发一次 warn；850 不重复
	record(700)
	assert.Empty(t, alerts)
	record(100)
	require.Len(t, alerts, 1)
	assert.Equal(t, TeamBudgetAlert{EnterpriseId: ent.Id, TeamId: team.Id, Month: month, Kind: TeamBudgetKindWarn, UsedQuota: 800, BudgetQuota: 1000, AlertPercent: 80}, alerts[0])
	record(50)
	assert.Len(t, alerts, 1)

	// 1000 达到预算发 exceeded；继续消费不重复
	record(150)
	require.Len(t, alerts, 2)
	assert.Equal(t, TeamBudgetKindExceeded, alerts[1].Kind)
	assert.Equal(t, int64(1000), alerts[1].UsedQuota)
	record(10)
	assert.Len(t, alerts, 2)

	// 列表回填本月消耗与状态；未设预算的团队为 none
	teams, err := ListEnterpriseTeams(ent.Id, EnterpriseScope{})
	require.NoError(t, err)
	states := map[string]*EnterpriseTeamListItem{}
	for _, item := range teams {
		states[item.Name] = item
	}
	assert.Equal(t, int64(1010), states["Research"].MonthQuota)
	assert.Equal(t, 101, states["Research"].BudgetPercent)
	assert.Equal(t, TeamBudgetStateExceeded, states["Research"].BudgetState)
	assert.Equal(t, TeamBudgetStateNone, states[EnterpriseDefaultTeamName].BudgetState)
	assert.Equal(t, int64(0), states[EnterpriseDefaultTeamName].MonthQuota)

	// 并发抢占同一档：只有一方拿到发送权；换月是另一把钥匙
	var wg sync.WaitGroup
	claimed := make([]bool, 8)
	for i := range claimed {
		wg.Go(func() {
			ok, err := ClaimTeamBudgetNotify(team.Id, "2099-01", TeamBudgetKindWarn, ent.Id)
			assert.NoError(t, err)
			claimed[i] = ok
		})
	}
	wg.Wait()
	winners := 0
	for _, ok := range claimed {
		if ok {
			winners++
		}
	}
	assert.Equal(t, 1, winners)
	ok, err := ClaimTeamBudgetNotify(team.Id, "2099-02", TeamBudgetKindWarn, ent.Id)
	require.NoError(t, err)
	assert.True(t, ok)

	// 上调预算：当月记录清掉、状态回到 ok；再次跨过新阈值 warn 可再发
	team.MonthlyBudgetQuota = 2000
	require.NoError(t, UpdateEnterpriseTeam(team))
	var remaining int64
	require.NoError(t, DB.Model(&EnterpriseTeamBudgetNotify{}).Where("team_id = ? AND month = ?", team.Id, month).Count(&remaining).Error)
	assert.Equal(t, int64(0), remaining)
	teams, err = ListEnterpriseTeams(ent.Id, EnterpriseScope{})
	require.NoError(t, err)
	for _, item := range teams {
		if item.Id == team.Id {
			assert.Equal(t, TeamBudgetStateOk, item.BudgetState)
			assert.Equal(t, 50, item.BudgetPercent)
		}
	}
	record(600)
	require.Len(t, alerts, 3)
	assert.Equal(t, TeamBudgetKindWarn, alerts[2].Kind)
	assert.Equal(t, int64(1610), alerts[2].UsedQuota)
	assert.Equal(t, int64(2000), alerts[2].BudgetQuota)

	// 预算改为 0 = 不设：不再判档
	team.MonthlyBudgetQuota = 0
	require.NoError(t, UpdateEnterpriseTeam(team))
	record(5000)
	assert.Len(t, alerts, 3)
}

// 周期限额（M4）：边界计算、写入即施行、范围校验、到期重置、软删清理、disabled 保持、never 删行
func TestEnterpriseTokenQuotaPolicy(t *testing.T) {
	setupEnterprisePostgres(t)
	// 2026-10-25 23:59:59 CST（周日）：日 / 周边界都落在 2026-10-26 00:00 CST = 1792944000（2026-10-25T16:00Z）；
	// 10-26 00:00 CST 本身是周一 0 点，下一次应推到 10-27 / 11-02 / 11-01
	const sundayLate, mondayStart = int64(1792943999), int64(1792944000)
	for _, test := range []struct {
		name   string
		period string
		now    int64
		want   int64
	}{
		{"daily before midnight", TokenQuotaResetDaily, sundayLate, mondayStart},
		{"daily at midnight moves to next day", TokenQuotaResetDaily, mondayStart, mondayStart + 86400},
		{"weekly before monday", TokenQuotaResetWeekly, sundayLate, mondayStart},
		{"weekly on monday moves a full week", TokenQuotaResetWeekly, mondayStart, mondayStart + 7*86400},
		{"monthly", TokenQuotaResetMonthly, mondayStart, mondayStart + 6*86400},
		{"custom", TokenQuotaResetCustom, mondayStart, mondayStart + 7200},
	} {
		assert.Equal(t, test.want, NextTokenQuotaResetAt(test.period, 7200, test.now), test.name)
	}
	assert.ErrorIs(t, TokenQuotaPolicyInput{ResetPeriod: TokenQuotaResetCustom, CustomSeconds: 1800, PeriodQuota: 1}.Validate(1000), ErrEnterpriseTokenQuotaPolicy)
	assert.ErrorIs(t, TokenQuotaPolicyInput{ResetPeriod: TokenQuotaResetCustom, CustomSeconds: 367 * 86400, PeriodQuota: 1}.Validate(1000), ErrEnterpriseTokenQuotaPolicy)
	assert.ErrorIs(t, TokenQuotaPolicyInput{ResetPeriod: TokenQuotaResetDaily, PeriodQuota: 0}.Validate(1000), ErrEnterpriseTokenQuotaPolicy)
	assert.ErrorIs(t, TokenQuotaPolicyInput{ResetPeriod: TokenQuotaResetDaily, PeriodQuota: 1001}.Validate(1000), ErrEnterpriseTokenQuotaPolicy)
	assert.ErrorIs(t, TokenQuotaPolicyInput{ResetPeriod: "yearly", PeriodQuota: 1}.Validate(1000), ErrEnterpriseTokenQuotaPolicy)
	assert.NoError(t, TokenQuotaPolicyInput{ResetPeriod: TokenQuotaResetNever}.Validate(1000))

	owner, ent := newEnterpriseForTest(t, "quotaowner", "Quota Co")
	rd := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "R&D"}
	require.NoError(t, CreateEnterpriseTeam(rd))
	qa := &EnterpriseTeam{EnterpriseId: ent.Id, Name: "QA"}
	require.NoError(t, CreateEnterpriseTeam(qa))
	exhausted := newEnterpriseTestToken(t, ent, owner.Id, "exhausted000000000000000000000000000000000000001", rd.Id, 0)
	require.NoError(t, DB.Model(&Token{}).Where("id = ?", exhausted.Id).Updates(map[string]any{"status": common.TokenStatusExhausted, "unlimited_quota": false, "remain_quota": 0, "used_quota": 900}).Error)
	disabled := newEnterpriseTestToken(t, ent, owner.Id, "disabled0000000000000000000000000000000000000001", rd.Id, 0)
	require.NoError(t, DB.Model(&Token{}).Where("id = ?", disabled.Id).Update("status", common.TokenStatusDisabled).Error)
	qaKey := newEnterpriseTestToken(t, ent, owner.Id, "qakey00000000000000000000000000000000000000000002", qa.Id, 0)
	daily := TokenQuotaPolicyInput{ResetPeriod: TokenQuotaResetDaily, PeriodQuota: 500000}

	// 范围：团队角色不能动别的团队的 key；超过 200 把拒绝；整批里混一个范围外 id 整批 404
	rdScope := EnterpriseScope{TeamId: &rd.Id}
	assert.ErrorIs(t, SetTokenQuotaPolicies(ent.Id, owner.Id, rdScope, []int{qaKey.Id}, daily), ErrEnterpriseResourceNotFound)
	assert.ErrorIs(t, SetTokenQuotaPolicies(ent.Id, owner.Id, rdScope, []int{exhausted.Id, qaKey.Id}, daily), ErrEnterpriseResourceNotFound)
	tooMany := make([]int, TokenQuotaPolicyBatchMax+1)
	assert.ErrorIs(t, SetTokenQuotaPolicies(ent.Id, owner.Id, EnterpriseScope{}, tooMany, daily), ErrEnterpriseTokenQuotaPolicy)
	var policyCount int64
	require.NoError(t, DB.Model(&EnterpriseTokenQuotaPolicy{}).Count(&policyCount).Error)
	assert.Zero(t, policyCount, "rejected batches must not leave rows behind")

	// 写入即施行：耗尽的 key 立刻恢复到周期额度并回到启用态，used_quota 不动；disabled 保持 disabled
	before := common.GetTimestamp()
	require.NoError(t, SetTokenQuotaPolicies(ent.Id, owner.Id, rdScope, []int{exhausted.Id, disabled.Id}, daily))
	stored, err := GetTokenById(exhausted.Id)
	require.NoError(t, err)
	assert.Equal(t, 500000, stored.RemainQuota)
	assert.False(t, stored.UnlimitedQuota)
	assert.Equal(t, common.TokenStatusEnabled, stored.Status)
	assert.Equal(t, 900, stored.UsedQuota)
	stored, err = GetTokenById(disabled.Id)
	require.NoError(t, err)
	assert.Equal(t, 500000, stored.RemainQuota)
	assert.Equal(t, common.TokenStatusDisabled, stored.Status)
	items, _, err := ListEnterpriseTokens(ent.Id, owner.Id, EnterpriseScope{}, EnterpriseTokenFilter{TeamId: &rd.Id}, 0, 20)
	require.NoError(t, err)
	require.Len(t, items, 2)
	for _, item := range items {
		assert.Equal(t, TokenQuotaResetDaily, item.ResetPeriod)
		assert.Equal(t, int64(500000), item.PeriodQuota)
		assert.Equal(t, NextTokenQuotaResetAt(TokenQuotaResetDaily, 0, before), item.NextResetAt)
	}
	qaItems, _, err := ListEnterpriseTokens(ent.Id, owner.Id, EnterpriseScope{}, EnterpriseTokenFilter{TeamId: &qa.Id}, 0, 20)
	require.NoError(t, err)
	require.Len(t, qaItems, 1)
	assert.Empty(t, qaItems[0].ResetPeriod)
	assert.Zero(t, qaItems[0].NextResetAt)

	// 到期任务：未到期不动；到期后恢复额度、4 → 1、next 以 now 为基准前移（补跑不连跳）；disabled 只重置额度
	require.NoError(t, DB.Model(&Token{}).Where("id = ?", exhausted.Id).Updates(map[string]any{"status": common.TokenStatusExhausted, "remain_quota": 0, "used_quota": 1500}).Error)
	reset, err := ResetDueTokenQuotaPolicies(before)
	require.NoError(t, err)
	assert.Zero(t, reset)
	past := before - 3*86400
	require.NoError(t, DB.Model(&EnterpriseTokenQuotaPolicy{}).Where("enterprise_id = ?", ent.Id).Update("next_reset_at", past).Error)
	reset, err = ResetDueTokenQuotaPolicies(before)
	require.NoError(t, err)
	assert.Equal(t, 2, reset)
	stored, err = GetTokenById(exhausted.Id)
	require.NoError(t, err)
	assert.Equal(t, 500000, stored.RemainQuota)
	assert.Equal(t, common.TokenStatusEnabled, stored.Status)
	assert.Equal(t, 1500, stored.UsedQuota)
	stored, err = GetTokenById(disabled.Id)
	require.NoError(t, err)
	assert.Equal(t, common.TokenStatusDisabled, stored.Status)
	// 每次用新变量查，避免 GORM 把上一次查到的主键带进条件
	var policy EnterpriseTokenQuotaPolicy
	findPolicy := func(tokenId int) error {
		policy = EnterpriseTokenQuotaPolicy{}
		return DB.First(&policy, "token_id = ?", tokenId).Error
	}
	require.NoError(t, findPolicy(exhausted.Id))
	assert.Equal(t, NextTokenQuotaResetAt(TokenQuotaResetDaily, 0, before), policy.NextResetAt)
	reset, err = ResetDueTokenQuotaPolicies(before)
	require.NoError(t, err)
	assert.Zero(t, reset, "second run in the same minute is a no-op")

	// 新建带策略：初始额度就是周期额度；never 删行且不动 tokens
	withPolicy := &Token{UserId: owner.Id, Name: "weekly", Key: "weekly000000000000000000000000000000000000000001", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, CreateEnterpriseTokenWithPolicy(ent.Id, EnterpriseScope{}, withPolicy, rd.Id, 0, &TokenQuotaPolicyInput{ResetPeriod: TokenQuotaResetWeekly, PeriodQuota: 250000}))
	stored, err = GetTokenById(withPolicy.Id)
	require.NoError(t, err)
	assert.Equal(t, 250000, stored.RemainQuota)
	assert.False(t, stored.UnlimitedQuota)
	require.NoError(t, findPolicy(withPolicy.Id))
	assert.Equal(t, TokenQuotaResetWeekly, policy.ResetPeriod)
	require.NoError(t, SetTokenQuotaPolicies(ent.Id, owner.Id, EnterpriseScope{}, []int{withPolicy.Id}, TokenQuotaPolicyInput{ResetPeriod: TokenQuotaResetNever}))
	assert.ErrorIs(t, findPolicy(withPolicy.Id), gorm.ErrRecordNotFound)
	stored, err = GetTokenById(withPolicy.Id)
	require.NoError(t, err)
	assert.Equal(t, 250000, stored.RemainQuota, "never keeps the current quota as a fixed quota")

	// 软删：企业页删除同事务清策略；绕过企业页软删的 key 由到期任务顺手清理
	_, err = DeleteEnterpriseToken(ent.Id, owner.Id, EnterpriseScope{}, disabled.Id)
	require.NoError(t, err)
	assert.ErrorIs(t, findPolicy(disabled.Id), gorm.ErrRecordNotFound)
	require.NoError(t, DB.Delete(&Token{}, "id = ?", exhausted.Id).Error)
	require.NoError(t, DB.Model(&EnterpriseTokenQuotaPolicy{}).Where("token_id = ?", exhausted.Id).Update("next_reset_at", past).Error)
	reset, err = ResetDueTokenQuotaPolicies(before)
	require.NoError(t, err)
	assert.Zero(t, reset)
	assert.ErrorIs(t, findPolicy(exhausted.Id), gorm.ErrRecordNotFound)

	// BatchUpdateEnabled 只影响扣费落库方式，策略写入不受影响
	previousBatch := common.BatchUpdateEnabled
	common.BatchUpdateEnabled = true
	t.Cleanup(func() { common.BatchUpdateEnabled = previousBatch })
	require.NoError(t, SetTokenQuotaPolicies(ent.Id, owner.Id, EnterpriseScope{}, []int{qaKey.Id}, TokenQuotaPolicyInput{ResetPeriod: TokenQuotaResetCustom, CustomSeconds: 7200, PeriodQuota: 100}))
	require.NoError(t, findPolicy(qaKey.Id))
	assert.Equal(t, policy.UpdatedAt+7200, policy.NextResetAt)
}
