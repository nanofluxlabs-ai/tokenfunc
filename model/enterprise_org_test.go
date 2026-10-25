package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
