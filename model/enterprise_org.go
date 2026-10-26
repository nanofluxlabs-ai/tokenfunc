package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 企业组织模型（TokenFunc 二开，三层）：团队（workspace，扁平）→ 成员 → key。
// 成员一张表覆盖四种人：不登录只持 key 的员工（user_id=0）、团队开发者、团队管理员、企业管理员。
// key 必属一个团队，可选归属一个持有人成员；计费主体始终是企业主账号（tokens.user_id）。

// 团队状态
const (
	EnterpriseTeamStatusActive   = "active"
	EnterpriseTeamStatusArchived = "archived"
)

// 成员状态
const (
	EnterpriseMemberStatusActive   = "active"
	EnterpriseMemberStatusDisabled = "disabled"
)

// 成员角色：none 不能登录控制台；其余三种要求绑定了登录账号
const (
	EnterpriseMemberRoleNone            = "none"
	EnterpriseMemberRoleDeveloper       = "developer"
	EnterpriseMemberRoleTeamAdmin       = "team_admin"
	EnterpriseMemberRoleEnterpriseAdmin = "enterprise_admin"
)

// EnterpriseDefaultTeamName 每个企业自动拥有的默认团队名（不可删、不可归档）
const EnterpriseDefaultTeamName = "Default"

// EnterpriseUnboundRemarkPrefix 企业开通的登录账号被解绑 / 随成员删除后写入 users.remark 的固定前缀：
// 该账号已停用并回到系统管理员的个人用户列表，前缀让管理员一眼识别出它是企业丢弃的账号，可按需清理
const EnterpriseUnboundRemarkPrefix = "[enterprise-unbound]"

var (
	ErrEnterpriseResourceNotFound   = errors.New("resource not found in this enterprise")
	ErrEnterpriseTeamInUse          = errors.New("team still has members or API keys")
	ErrEnterpriseTeamDefault        = errors.New("the default team cannot be deleted or archived")
	ErrEnterpriseTeamArchived       = errors.New("team is archived")
	ErrEnterpriseDuplicateName      = errors.New("name already exists")
	ErrEnterpriseMemberNotActive    = errors.New("member is disabled")
	ErrEnterpriseMemberTeamMismatch = errors.New("member does not belong to this team")
	ErrEnterpriseMemberNoLogin      = errors.New("member has no login account")
	ErrEnterpriseMemberHasLogin     = errors.New("member already has a login account")
	ErrEnterpriseLoginUserTaken     = errors.New("this account already belongs to an enterprise")
	ErrEnterpriseLoginUserInvalid   = errors.New("this account cannot be used as an enterprise member")
	ErrEnterpriseLoginUserNotFound  = errors.New("no account found for this username or email")
	ErrEnterpriseInvalidRole        = errors.New("invalid member role")
	ErrEnterpriseNoAccess           = errors.New("enterprise access required")
)

// EnterpriseTeam 团队（扁平，不嵌套）；预算字段由团队预算模块使用
type EnterpriseTeam struct {
	Id                 int            `json:"id"`
	EnterpriseId       int            `json:"enterprise_id" gorm:"not null;index;uniqueIndex:uk_ent_team_name,priority:1,where:deleted_at IS NULL;uniqueIndex:uk_ent_team_default,where:is_default AND deleted_at IS NULL"`
	Name               string         `json:"name" gorm:"type:varchar(64);not null;uniqueIndex:uk_ent_team_name,priority:2,where:deleted_at IS NULL"`
	Sort               int            `json:"sort" gorm:"not null;default:0"`
	IsDefault          bool           `json:"is_default" gorm:"not null;default:false"`
	Status             string         `json:"status" gorm:"type:varchar(16);not null;default:'active'"`
	MonthlyBudgetQuota int64          `json:"monthly_budget_quota" gorm:"not null;default:0"`
	BudgetAlertPercent int            `json:"budget_alert_percent" gorm:"not null;default:80"`
	BudgetEnforce      bool           `json:"budget_enforce" gorm:"not null;default:false"`
	CreatedAt          int64          `json:"created_at" gorm:"not null"`
	UpdatedAt          int64          `json:"updated_at" gorm:"not null"`
	DeletedAt          gorm.DeletedAt `json:"-" gorm:"index"`
}

func (EnterpriseTeam) TableName() string { return "ent_teams" }

// EnterpriseMember 成员：不登录时等价于 service account，只通过分配的 key 调用；绑定登录账号后按 role 使用控制台
type EnterpriseMember struct {
	Id           int            `json:"id"`
	EnterpriseId int            `json:"enterprise_id" gorm:"not null;index;uniqueIndex:uk_ent_employee_no,priority:1,where:employee_no <> '' AND deleted_at IS NULL"`
	TeamId       int            `json:"team_id" gorm:"not null;default:0;index"`
	Name         string         `json:"name" gorm:"type:varchar(64);not null"`
	Email        string         `json:"email" gorm:"type:varchar(128);not null;default:''"`
	EmployeeNo   string         `json:"employee_no" gorm:"type:varchar(64);not null;default:'';uniqueIndex:uk_ent_employee_no,priority:2,where:employee_no <> '' AND deleted_at IS NULL"`
	UserId       int            `json:"user_id" gorm:"not null;default:0;uniqueIndex:uk_ent_member_user,where:user_id > 0 AND deleted_at IS NULL"`
	Role         string         `json:"role" gorm:"type:varchar(16);not null;default:'none'"`
	Provisioned  bool           `json:"provisioned" gorm:"not null;default:false"`
	Status       string         `json:"status" gorm:"type:varchar(16);not null"`
	Remark       string         `json:"remark" gorm:"type:text"`
	CreatedAt    int64          `json:"created_at" gorm:"not null"`
	UpdatedAt    int64          `json:"updated_at" gorm:"not null"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

func (EnterpriseMember) TableName() string { return "ent_members" }

// EnterpriseTokenAssignment key 的归属：必属一个团队，可选持有人；独立成表以免给上游 tokens 表加列
type EnterpriseTokenAssignment struct {
	TokenId      int   `json:"token_id" gorm:"primaryKey;autoIncrement:false"`
	EnterpriseId int   `json:"enterprise_id" gorm:"not null;index"`
	TeamId       int   `json:"team_id" gorm:"not null;default:0;index"`
	MemberId     int   `json:"member_id" gorm:"not null;default:0;index"`
	CreatedAt    int64 `json:"created_at" gorm:"not null"`
	UpdatedAt    int64 `json:"updated_at" gorm:"not null"`
}

func (EnterpriseTokenAssignment) TableName() string { return "ent_token_assignments" }

// isUniqueViolation 判断 PG 唯一约束冲突（SQLSTATE 23505）
func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")
}

func normalizeEnterpriseName(name string, maxLen int) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > maxLen {
		return "", fmt.Errorf("name is required and must be at most %d characters", maxLen)
	}
	return name, nil
}

// ---------------------------------------------------------------------------
// 范围（team_admin / developer 只能看自己的团队）
// ---------------------------------------------------------------------------

// EnterpriseScope 控制台查询范围：TeamId 为 nil 表示全企业
type EnterpriseScope struct {
	TeamId *int
}

// Allows 该范围是否覆盖某个团队
func (s EnterpriseScope) Allows(teamId int) bool {
	return s.TeamId == nil || *s.TeamId == teamId
}

func scopeTeam(teamId int) EnterpriseScope { return EnterpriseScope{TeamId: &teamId} }

// EnterpriseActor 当前登录者在企业里的身份
type EnterpriseActor struct {
	MemberId    int    `json:"member_id"`
	Role        string `json:"role"`
	TeamId      int    `json:"team_id"`
	IsOwner     bool   `json:"is_owner"`
	Provisioned bool   `json:"provisioned"`
}

// Scope 主账号与企业管理员看全企业，其余只看本团队
func (a EnterpriseActor) Scope() EnterpriseScope {
	if a.IsOwner || a.Role == EnterpriseMemberRoleEnterpriseAdmin {
		return EnterpriseScope{}
	}
	return scopeTeam(a.TeamId)
}

// enterpriseRoleRank 角色高低：owner > enterprise_admin > team_admin > developer > none
func enterpriseRoleRank(role string) int {
	switch role {
	case EnterpriseMemberRoleDeveloper:
		return 1
	case EnterpriseMemberRoleTeamAdmin:
		return 2
	case EnterpriseMemberRoleEnterpriseAdmin:
		return 3
	}
	return 0
}

// Rank 主账号视为最高
func (a EnterpriseActor) Rank() int {
	if a.IsOwner {
		return 4
	}
	return enterpriseRoleRank(a.Role)
}

// AtLeast 是否不低于某个角色
func (a EnterpriseActor) AtLeast(role string) bool { return a.Rank() >= enterpriseRoleRank(role) }

// GetEnterpriseAccess 解析登录用户的企业身份：主账号，或绑定了登录账号且角色不为 none 的在职成员
func GetEnterpriseAccess(userId int) (*Enterprise, *EnterpriseActor, error) {
	enterprise, err := GetEnterpriseByUserId(userId)
	if err == nil {
		return enterprise, &EnterpriseActor{IsOwner: true, Role: EnterpriseMemberRoleEnterpriseAdmin}, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, err
	}
	var member EnterpriseMember
	err = DB.Where("user_id = ? AND role <> ? AND status = ?", userId, EnterpriseMemberRoleNone, EnterpriseMemberStatusActive).First(&member).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, ErrEnterpriseNoAccess
	}
	if err != nil {
		return nil, nil, err
	}
	enterprise, err = GetEnterpriseById(member.EnterpriseId)
	if err != nil {
		return nil, nil, err
	}
	return enterprise, &EnterpriseActor{MemberId: member.Id, Role: member.Role, TeamId: member.TeamId, Provisioned: member.Provisioned}, nil
}

// ---------------------------------------------------------------------------
// 团队
// ---------------------------------------------------------------------------

// EnterpriseTeamListItem 团队列表行：附带成员数与 key 数
type EnterpriseTeamListItem struct {
	EnterpriseTeam
	MemberCount int `json:"member_count"`
	TokenCount  int `json:"token_count"`
	// 本月消耗与预算状态（none / ok / warn / exceeded），列表时回填
	MonthQuota    int64  `json:"month_quota" gorm:"-"`
	BudgetPercent int    `json:"budget_percent" gorm:"-"`
	BudgetState   string `json:"budget_state" gorm:"-"`
}

func ListEnterpriseTeams(enterpriseId int, scope EnterpriseScope) ([]*EnterpriseTeamListItem, error) {
	query := DB.Table("ent_teams").Where("ent_teams.enterprise_id = ? AND ent_teams.deleted_at IS NULL", enterpriseId)
	if scope.TeamId != nil {
		query = query.Where("ent_teams.id = ?", *scope.TeamId)
	}
	items := make([]*EnterpriseTeamListItem, 0)
	err := query.
		Select(`ent_teams.*,
			(SELECT COUNT(*) FROM ent_members m WHERE m.team_id = ent_teams.id AND m.deleted_at IS NULL) AS member_count,
			(SELECT COUNT(*) FROM ent_token_assignments a JOIN tokens t ON t.id = a.token_id AND t.deleted_at IS NULL
			 WHERE a.team_id = ent_teams.id) AS token_count`).
		Order("ent_teams.is_default DESC, ent_teams.sort ASC, ent_teams.id ASC").
		Scan(&items).Error
	if err != nil {
		return nil, err
	}
	return items, fillTeamBudgetStates(enterpriseId, items)
}

func getEnterpriseTeam(tx *gorm.DB, enterpriseId int, id int) (*EnterpriseTeam, error) {
	var team EnterpriseTeam
	err := tx.Where("enterprise_id = ? AND id = ?", enterpriseId, id).First(&team).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &team, err
}

// GetEnterpriseTeam 读取团队（范围外视为不存在）
func GetEnterpriseTeam(enterpriseId int, id int, scope EnterpriseScope) (*EnterpriseTeam, error) {
	if !scope.Allows(id) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return getEnterpriseTeam(DB, enterpriseId, id)
}

// ensureDefaultTeam 返回企业的默认团队 id，不存在则创建（企业建立时、迁移时与兜底路径共用）
func ensureDefaultTeam(tx *gorm.DB, enterpriseId int) (int, error) {
	var team EnterpriseTeam
	err := tx.Where("enterprise_id = ? AND is_default = ?", enterpriseId, true).First(&team).Error
	if err == nil {
		return team.Id, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}
	now := common.GetTimestamp()
	team = EnterpriseTeam{EnterpriseId: enterpriseId, Name: EnterpriseDefaultTeamName, IsDefault: true, Status: EnterpriseTeamStatusActive, BudgetAlertPercent: 80, CreatedAt: now, UpdatedAt: now}
	if err := tx.Create(&team).Error; err != nil {
		if !isUniqueViolation(err) {
			return 0, err
		}
		// 同名团队已存在（历史数据）：把它提升为默认团队
		if err := tx.Model(&EnterpriseTeam{}).Where("enterprise_id = ? AND name = ?", enterpriseId, EnterpriseDefaultTeamName).Update("is_default", true).Error; err != nil {
			return 0, err
		}
		if err := tx.Where("enterprise_id = ? AND is_default = ?", enterpriseId, true).First(&team).Error; err != nil {
			return 0, err
		}
	}
	return team.Id, nil
}

// EnsureDefaultTeam 对外入口（企业建立后调用）
func EnsureDefaultTeam(enterpriseId int) (int, error) {
	return ensureDefaultTeam(DB, enterpriseId)
}

// resolveTeamId 0 表示默认团队
func resolveTeamId(tx *gorm.DB, enterpriseId int, teamId int) (int, error) {
	if teamId != 0 {
		return teamId, nil
	}
	return ensureDefaultTeam(tx, enterpriseId)
}

func (t *EnterpriseTeam) normalize() error {
	name, err := normalizeEnterpriseName(t.Name, 64)
	if err != nil {
		return err
	}
	t.Name = name
	if t.Status == "" {
		t.Status = EnterpriseTeamStatusActive
	}
	if t.Status != EnterpriseTeamStatusActive && t.Status != EnterpriseTeamStatusArchived {
		return fmt.Errorf("invalid team status: %s", t.Status)
	}
	if t.MonthlyBudgetQuota < 0 {
		return errors.New("monthly budget cannot be negative")
	}
	if t.BudgetAlertPercent < 0 || t.BudgetAlertPercent > 99 {
		return errors.New("budget alert percent must be between 0 and 99")
	}
	return nil
}

func CreateEnterpriseTeam(team *EnterpriseTeam) error {
	if err := team.normalize(); err != nil {
		return err
	}
	now := common.GetTimestamp()
	team.Id = 0
	team.IsDefault = false
	team.CreatedAt = now
	team.UpdatedAt = now
	if err := DB.Create(team).Error; err != nil {
		if isUniqueViolation(err) {
			return ErrEnterpriseDuplicateName
		}
		return err
	}
	return nil
}

// UpdateEnterpriseTeam 更新名称、排序与预算配置（默认团队可改预算，不可改名为空）
func UpdateEnterpriseTeam(team *EnterpriseTeam) error {
	if err := team.normalize(); err != nil {
		return err
	}
	current, err := getEnterpriseTeam(DB, team.EnterpriseId, team.Id)
	if err != nil {
		return err
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Model(&EnterpriseTeam{}).Where("enterprise_id = ? AND id = ?", team.EnterpriseId, team.Id).Updates(map[string]any{
			"name":                 team.Name,
			"sort":                 team.Sort,
			"monthly_budget_quota": team.MonthlyBudgetQuota,
			"budget_alert_percent": team.BudgetAlertPercent,
			"budget_enforce":       team.BudgetEnforce,
			"updated_at":           common.GetTimestamp(),
		}).Error
		if err != nil {
			return err
		}
		// 预算上调：当月两档都可再触发；只改阈值：告警档按新阈值重新生效
		month := EnterpriseBudgetMonth(time.Now())
		if team.MonthlyBudgetQuota > current.MonthlyBudgetQuota {
			return resetTeamBudgetNotifyTx(tx, team.Id, month, TeamBudgetKindWarn, TeamBudgetKindExceeded)
		}
		if team.BudgetAlertPercent != current.BudgetAlertPercent {
			return resetTeamBudgetNotifyTx(tx, team.Id, month, TeamBudgetKindWarn)
		}
		return nil
	})
	if isUniqueViolation(err) {
		return ErrEnterpriseDuplicateName
	}
	if err != nil {
		return err
	}
	// 拦截判定读的是计费信息缓存里的预算 map，配置变更后立即失效
	InvalidateEnterpriseBillingInfoByEnterprise(team.EnterpriseId)
	InvalidateTeamMonthUsage(team.Id)
	return nil
}

// disableTeamTokens 停用团队名下全部启用中的 key（归档团队时）
func disableTeamTokens(tx *gorm.DB, enterpriseId int, teamId int) error {
	return disableAssignedTokens(tx, "a.enterprise_id = ? AND a.team_id = ?", enterpriseId, teamId)
}

// disableAssignedTokens 按归属条件停用 key：先失效缓存（设置 fence）再写库，防止并发读者回填旧状态
func disableAssignedTokens(tx *gorm.DB, where string, args ...any) error {
	var tokens []Token
	err := tx.Model(&Token{}).
		Select("tokens.id", "tokens."+commonKeyCol).
		Joins("JOIN ent_token_assignments a ON a.token_id = tokens.id").
		Where(where, args...).
		Where("tokens.status = ?", common.TokenStatusEnabled).
		Find(&tokens).Error
	if err != nil || len(tokens) == 0 {
		return err
	}
	if err := invalidateTokensCache(tokens); err != nil {
		common.SysLog("failed to invalidate enterprise token cache: " + err.Error())
	}
	ids := make([]int, 0, len(tokens))
	for _, token := range tokens {
		ids = append(ids, token.Id)
	}
	return tx.Model(&Token{}).Where("id IN ?", ids).Update("status", common.TokenStatusDisabled).Error
}

// ArchiveEnterpriseTeam 归档团队：停用其全部 key，成员保留但不能再分配新 key；默认团队不可归档
func ArchiveEnterpriseTeam(enterpriseId int, id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		team, err := getEnterpriseTeam(lockForUpdate(tx), enterpriseId, id)
		if err != nil {
			return err
		}
		if team.IsDefault {
			return ErrEnterpriseTeamDefault
		}
		if err := disableTeamTokens(tx, enterpriseId, id); err != nil {
			return err
		}
		return tx.Model(&EnterpriseTeam{}).Where("id = ?", id).Updates(map[string]any{"status": EnterpriseTeamStatusArchived, "updated_at": common.GetTimestamp()}).Error
	})
}

// DeleteEnterpriseTeam 软删除团队；默认团队、仍有成员或 key 的团队拒绝
func DeleteEnterpriseTeam(enterpriseId int, id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		team, err := getEnterpriseTeam(lockForUpdate(tx), enterpriseId, id)
		if err != nil {
			return err
		}
		if team.IsDefault {
			return ErrEnterpriseTeamDefault
		}
		var members, keys int64
		if err := tx.Model(&EnterpriseMember{}).Where("enterprise_id = ? AND team_id = ?", enterpriseId, id).Count(&members).Error; err != nil {
			return err
		}
		if err := tx.Table("ent_token_assignments a").Joins("JOIN tokens t ON t.id = a.token_id AND t.deleted_at IS NULL").
			Where("a.enterprise_id = ? AND a.team_id = ?", enterpriseId, id).Count(&keys).Error; err != nil {
			return err
		}
		if members > 0 || keys > 0 {
			return ErrEnterpriseTeamInUse
		}
		return tx.Where("enterprise_id = ? AND id = ?", enterpriseId, id).Delete(&EnterpriseTeam{}).Error
	})
}

// ---------------------------------------------------------------------------
// 成员
// ---------------------------------------------------------------------------

// EnterpriseMemberListItem 成员列表行：附带团队名、登录账号名与名下 key 数量
type EnterpriseMemberListItem struct {
	EnterpriseMember
	TeamName   string `json:"team_name"`
	Username   string `json:"username"`
	TokenCount int    `json:"token_count"`
	// MonthQuota 本月消耗（quota），按归属快照汇总 ent_usage_daily
	MonthQuota int64 `json:"month_quota"`
}

type EnterpriseMemberFilter struct {
	TeamId   *int
	Id       *int
	Keyword  string
	Status   string
	HasLogin *bool
}

func ListEnterpriseMembers(enterpriseId int, scope EnterpriseScope, filter EnterpriseMemberFilter, startIdx int, num int) ([]*EnterpriseMemberListItem, int64, error) {
	query := DB.Table("ent_members").
		Where("ent_members.enterprise_id = ? AND ent_members.deleted_at IS NULL", enterpriseId)
	if scope.TeamId != nil {
		query = query.Where("ent_members.team_id = ?", *scope.TeamId)
	}
	if filter.TeamId != nil {
		query = query.Where("ent_members.team_id = ?", *filter.TeamId)
	}
	if filter.Id != nil {
		query = query.Where("ent_members.id = ?", *filter.Id)
	}
	if filter.Status != "" {
		query = query.Where("ent_members.status = ?", filter.Status)
	}
	if filter.HasLogin != nil {
		if *filter.HasLogin {
			query = query.Where("ent_members.user_id > 0")
		} else {
			query = query.Where("ent_members.user_id = 0")
		}
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("(ent_members.name ILIKE ? OR ent_members.email ILIKE ? OR ent_members.employee_no ILIKE ?)", like, like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]*EnterpriseMemberListItem, 0)
	monthStart, _, _, _ := enterpriseMonthRange(time.Now())
	err := query.
		Select(`ent_members.*, COALESCE(tm.name, '') AS team_name, COALESCE(u.username, '') AS username,
			(SELECT COUNT(*) FROM ent_token_assignments a JOIN tokens t ON t.id = a.token_id AND t.deleted_at IS NULL
			 WHERE a.member_id = ent_members.id) AS token_count,
			(SELECT COALESCE(SUM(ud.quota), 0) FROM ent_usage_daily ud
			 WHERE ud.enterprise_id = ent_members.enterprise_id AND ud.member_id = ent_members.id AND ud.day >= ?) AS month_quota`, monthStart).
		Joins("LEFT JOIN ent_teams tm ON tm.id = ent_members.team_id").
		Joins("LEFT JOIN users u ON u.id = ent_members.user_id AND ent_members.user_id > 0").
		Order("ent_members.id DESC").
		Limit(num).Offset(startIdx).
		Scan(&items).Error
	return items, total, err
}

func getEnterpriseMember(tx *gorm.DB, enterpriseId int, id int) (*EnterpriseMember, error) {
	var member EnterpriseMember
	err := tx.Where("enterprise_id = ? AND id = ?", enterpriseId, id).First(&member).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &member, err
}

// GetEnterpriseMember 读取成员（范围外视为不存在）
func GetEnterpriseMember(enterpriseId int, id int, scope EnterpriseScope) (*EnterpriseMember, error) {
	member, err := getEnterpriseMember(DB, enterpriseId, id)
	if err != nil {
		return nil, err
	}
	if !scope.Allows(member.TeamId) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return member, nil
}

func (m *EnterpriseMember) normalize() error {
	name, err := normalizeEnterpriseName(m.Name, 64)
	if err != nil {
		return err
	}
	m.Name = name
	m.Email = strings.TrimSpace(m.Email)
	m.EmployeeNo = strings.TrimSpace(m.EmployeeNo)
	if len(m.Email) > 128 || len(m.EmployeeNo) > 64 {
		return errors.New("email or employee number is too long")
	}
	if m.Status == "" {
		m.Status = EnterpriseMemberStatusActive
	}
	if m.Status != EnterpriseMemberStatusActive && m.Status != EnterpriseMemberStatusDisabled {
		return fmt.Errorf("invalid member status: %s", m.Status)
	}
	if m.Role == "" {
		m.Role = EnterpriseMemberRoleNone
	}
	return nil
}

// ensureMemberTeam 校验团队属于本企业且未归档，返回解析后的团队 id（0 → 默认团队）
func ensureMemberTeam(tx *gorm.DB, enterpriseId int, teamId int) (int, error) {
	teamId, err := resolveTeamId(tx, enterpriseId, teamId)
	if err != nil {
		return 0, err
	}
	team, err := getEnterpriseTeam(tx, enterpriseId, teamId)
	if err != nil {
		return 0, err
	}
	if team.Status != EnterpriseTeamStatusActive {
		return 0, ErrEnterpriseTeamArchived
	}
	return team.Id, nil
}

func CreateEnterpriseMember(member *EnterpriseMember) error {
	if err := member.normalize(); err != nil {
		return err
	}
	member.UserId = 0
	member.Role = EnterpriseMemberRoleNone
	member.Provisioned = false
	return DB.Transaction(func(tx *gorm.DB) error {
		teamId, err := ensureMemberTeam(tx, member.EnterpriseId, member.TeamId)
		if err != nil {
			return err
		}
		member.TeamId = teamId
		now := common.GetTimestamp()
		member.Id = 0
		member.CreatedAt = now
		member.UpdatedAt = now
		if err := tx.Create(member).Error; err != nil {
			if isUniqueViolation(err) {
				return ErrEnterpriseDuplicateName
			}
			return err
		}
		return nil
	})
}

func disableMemberTokens(tx *gorm.DB, enterpriseId int, memberId int) error {
	return disableAssignedTokens(tx, "a.enterprise_id = ? AND a.member_id = ?", enterpriseId, memberId)
}

// disableProvisionedLogin 停用企业开通的登录账号（绑定的已有账号不动）
func disableProvisionedLogin(tx *gorm.DB, member *EnterpriseMember) error {
	if member.UserId == 0 || !member.Provisioned {
		return nil
	}
	if err := tx.Model(&User{}).Where("id = ?", member.UserId).Update("status", common.UserStatusDisabled).Error; err != nil {
		return err
	}
	if err := invalidateUserCache(member.UserId); err != nil {
		common.SysLog("failed to invalidate member user cache: " + err.Error())
	}
	return nil
}

// markProvisionedLoginUnbound 解绑 / 删除成员后，企业开通的账号成为孤儿：在 users.remark 写固定标识供系统管理员识别。
// 管理员手写的备注不覆盖（只在备注为空或已是本标识时写入）；停用成员不走这里，账号仍归企业。
func markProvisionedLoginUnbound(tx *gorm.DB, member *EnterpriseMember) error {
	if member.UserId == 0 || !member.Provisioned {
		return nil
	}
	remark := fmt.Sprintf("%s enterprise #%d member #%d %s", EnterpriseUnboundRemarkPrefix, member.EnterpriseId, member.Id, time.Now().Format("2006-01-02"))
	return tx.Model(&User{}).
		Where("id = ? AND (remark = '' OR remark IS NULL OR remark LIKE ?)", member.UserId, EnterpriseUnboundRemarkPrefix+"%").
		Update("remark", remark).Error
}

// UpdateEnterpriseMember 更新资料；换团队时名下 key 的团队归属同步更新；状态改为停用时停用其全部 key 与企业开通的登录账号
func UpdateEnterpriseMember(member *EnterpriseMember) error {
	if err := member.normalize(); err != nil {
		return err
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		existing, err := getEnterpriseMember(lockForUpdate(tx), member.EnterpriseId, member.Id)
		if err != nil {
			return err
		}
		teamId, err := ensureMemberTeam(tx, member.EnterpriseId, member.TeamId)
		if err != nil {
			return err
		}
		member.TeamId = teamId
		err = tx.Model(&EnterpriseMember{}).Where("id = ?", member.Id).Updates(map[string]any{
			"team_id":     member.TeamId,
			"name":        member.Name,
			"email":       member.Email,
			"employee_no": member.EmployeeNo,
			"status":      member.Status,
			"remark":      member.Remark,
			"updated_at":  common.GetTimestamp(),
		}).Error
		if isUniqueViolation(err) {
			return ErrEnterpriseDuplicateName
		}
		if err != nil {
			return err
		}
		if existing.TeamId != member.TeamId {
			if err := tx.Model(&EnterpriseTokenAssignment{}).Where("enterprise_id = ? AND member_id = ?", member.EnterpriseId, member.Id).
				Updates(map[string]any{"team_id": member.TeamId, "updated_at": common.GetTimestamp()}).Error; err != nil {
				return err
			}
		}
		if existing.Status == EnterpriseMemberStatusActive && member.Status == EnterpriseMemberStatusDisabled {
			if err := disableMemberTokens(tx, member.EnterpriseId, member.Id); err != nil {
				return err
			}
			return disableProvisionedLogin(tx, existing)
		}
		return nil
	})
	if err == nil {
		InvalidateAllTokenAttribution()
	}
	return err
}

// DeleteEnterpriseMember 软删除成员并停用其名下 key 与企业开通的登录账号；key 归属保留，历史统计不受影响
func DeleteEnterpriseMember(enterpriseId int, id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		member, err := getEnterpriseMember(lockForUpdate(tx), enterpriseId, id)
		if err != nil {
			return err
		}
		if err := disableMemberTokens(tx, enterpriseId, id); err != nil {
			return err
		}
		if err := disableProvisionedLogin(tx, member); err != nil {
			return err
		}
		if err := markProvisionedLoginUnbound(tx, member); err != nil {
			return err
		}
		return tx.Where("enterprise_id = ? AND id = ?", enterpriseId, id).Delete(&EnterpriseMember{}).Error
	})
}

// ---------------------------------------------------------------------------
// 成员登录账号与角色
// ---------------------------------------------------------------------------

// validateEnterpriseRole 角色取值校验（none 由解绑路径设置，不接受外部直接设置）
func validateEnterpriseRole(role string) error {
	switch role {
	case EnterpriseMemberRoleDeveloper, EnterpriseMemberRoleTeamAdmin, EnterpriseMemberRoleEnterpriseAdmin:
		return nil
	}
	return ErrEnterpriseInvalidRole
}

// isEnterpriseOwnerUser 该用户是否是任何企业的主账号
func isEnterpriseOwnerUser(tx *gorm.DB, userId int) (bool, error) {
	var count int64
	err := tx.Model(&Enterprise{}).Where("user_id = ?", userId).Count(&count).Error
	return count > 0, err
}

// FindUserForEnterpriseLogin 按用户名或邮箱精确查找可绑定的登录账号：普通用户、已启用、不是企业主账号
func FindUserForEnterpriseLogin(identifier string) (*User, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil, ErrEnterpriseLoginUserInvalid
	}
	var user User
	err := DB.Where("username = ? OR (email <> '' AND LOWER(email) = LOWER(?))", identifier, identifier).Order("id ASC").First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseLoginUserNotFound
	}
	if err != nil {
		return nil, err
	}
	if user.Role != common.RoleCommonUser || user.Status != common.UserStatusEnabled {
		return nil, ErrEnterpriseLoginUserInvalid
	}
	owner, err := isEnterpriseOwnerUser(DB, user.Id)
	if err != nil {
		return nil, err
	}
	if owner {
		return nil, ErrEnterpriseLoginUserInvalid
	}
	return &user, nil
}

// bindMemberLogin 把登录账号写到成员上（事务内）；唯一索引保证一个账号只属一个成员
func bindMemberLogin(tx *gorm.DB, enterpriseId int, memberId int, userId int, role string, provisioned bool) error {
	if err := validateEnterpriseRole(role); err != nil {
		return err
	}
	member, err := getEnterpriseMember(lockForUpdate(tx), enterpriseId, memberId)
	if err != nil {
		return err
	}
	if member.UserId != 0 {
		return ErrEnterpriseMemberHasLogin
	}
	if member.Status != EnterpriseMemberStatusActive {
		return ErrEnterpriseMemberNotActive
	}
	err = tx.Model(&EnterpriseMember{}).Where("id = ?", memberId).Updates(map[string]any{
		"user_id":     userId,
		"role":        role,
		"provisioned": provisioned,
		"updated_at":  common.GetTimestamp(),
	}).Error
	if isUniqueViolation(err) {
		return ErrEnterpriseLoginUserTaken
	}
	return err
}

// BindEnterpriseMemberLogin 绑定已有账号
func BindEnterpriseMemberLogin(enterpriseId int, memberId int, user *User, role string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		owner, err := isEnterpriseOwnerUser(tx, user.Id)
		if err != nil {
			return err
		}
		if owner {
			return ErrEnterpriseLoginUserInvalid
		}
		return bindMemberLogin(tx, enterpriseId, memberId, user.Id, role, false)
	})
}

// ProvisionedLogin 一键开通返回的凭据（初始密码只出现这一次）
type ProvisionedLogin struct {
	UserId   int    `json:"user_id"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// ProvisionEnterpriseMemberLogin 为成员一键开通登录账号：普通用户、余额 0、不发新人赠送额度，随机初始密码
func ProvisionEnterpriseMemberLogin(enterpriseId int, memberId int, role string) (*ProvisionedLogin, error) {
	member, err := getEnterpriseMember(DB, enterpriseId, memberId)
	if err != nil {
		return nil, err
	}
	if member.UserId != 0 {
		return nil, ErrEnterpriseMemberHasLogin
	}
	if err := validateEnterpriseRole(role); err != nil {
		return nil, err
	}
	password := common.GetRandomString(16)
	username := enterpriseProvisionedUsername(enterpriseId, memberId, member.Email)
	// 之前开通过又解绑：账号被停用但仍占着用户名与邮箱，复用该账号并重置密码
	var existing User
	err = DB.Where("username = ?", username).First(&existing).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if existing.Id != 0 {
		if existing.Role != common.RoleCommonUser {
			return nil, ErrEnterpriseLoginUserInvalid
		}
		hash, err := common.HashAccountPassword(password)
		if err != nil {
			return nil, err
		}
		email := NormalizeEmail(member.Email)
		err = DB.Transaction(func(tx *gorm.DB) error {
			if err := ensureEmailAvailableWithTx(tx, email, existing.Id); err != nil {
				return err
			}
			updates := map[string]any{
				"password":     hash,
				"status":       common.UserStatusEnabled,
				"quota":        0,
				"display_name": member.Name,
				"email":        email,
			}
			// 解绑时写的孤儿标识随重新开通清掉；管理员手写的备注保留
			if strings.HasPrefix(existing.Remark, EnterpriseUnboundRemarkPrefix) {
				updates["remark"] = ""
			}
			if err := tx.Model(&User{}).Where("id = ?", existing.Id).Updates(updates).Error; err != nil {
				return err
			}
			return bindMemberLogin(tx, enterpriseId, memberId, existing.Id, role, true)
		})
		if err != nil {
			return nil, err
		}
		if err := invalidateUserCache(existing.Id); err != nil {
			common.SysLog("failed to invalidate member user cache: " + err.Error())
		}
		return &ProvisionedLogin{UserId: existing.Id, Username: username, Password: password}, nil
	}
	user := &User{
		Username:    username,
		Password:    password,
		DisplayName: member.Name,
		Email:       member.Email,
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := user.InsertWithTx(tx, 0); err != nil {
			return err
		}
		if err := tx.Model(&User{}).Where("id = ?", user.Id).Update("quota", 0).Error; err != nil {
			return err
		}
		return bindMemberLogin(tx, enterpriseId, memberId, user.Id, role, true)
	})
	if err != nil {
		return nil, err
	}
	user.FinishInsert(0)
	return &ProvisionedLogin{UserId: user.Id, Username: user.Username, Password: password}, nil
}

// enterpriseProvisionedUsername 开通账号的用户名：邮箱前缀优先，带企业与成员 id 后缀保证唯一且不与注册用户撞名
func enterpriseProvisionedUsername(enterpriseId int, memberId int, email string) string {
	prefix := "member"
	if local, _, found := strings.Cut(email, "@"); found {
		cleaned := strings.Builder{}
		for _, r := range strings.ToLower(local) {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
				cleaned.WriteRune(r)
			}
		}
		if cleaned.Len() > 0 {
			prefix = cleaned.String()
		}
	}
	if len(prefix) > 20 {
		prefix = prefix[:20]
	}
	return fmt.Sprintf("%s-e%dm%d", prefix, enterpriseId, memberId)
}

// UnbindEnterpriseMemberLogin 解绑登录账号：角色归 none；企业开通的账号同时停用
func UnbindEnterpriseMemberLogin(enterpriseId int, memberId int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		member, err := getEnterpriseMember(lockForUpdate(tx), enterpriseId, memberId)
		if err != nil {
			return err
		}
		if member.UserId == 0 {
			return ErrEnterpriseMemberNoLogin
		}
		if err := disableProvisionedLogin(tx, member); err != nil {
			return err
		}
		if err := markProvisionedLoginUnbound(tx, member); err != nil {
			return err
		}
		return tx.Model(&EnterpriseMember{}).Where("id = ?", memberId).Updates(map[string]any{
			"user_id":     0,
			"role":        EnterpriseMemberRoleNone,
			"provisioned": false,
			"updated_at":  common.GetTimestamp(),
		}).Error
	})
}

// EnterpriseAffiliation 一个登录账号与企业的归属关系：企业主账号或在职成员的登录账号
type EnterpriseAffiliation struct {
	EnterpriseId int
	IsOwner      bool
	MemberId     int
}

// GetUserEnterpriseAffiliation 查账号归属：先看是否企业主，再看是否在职成员（软删除的成员不算）；都不是返回 nil
func GetUserEnterpriseAffiliation(userId int) (*EnterpriseAffiliation, error) {
	if userId <= 0 {
		return nil, nil
	}
	var enterprise Enterprise
	err := DB.Select("id").Where("user_id = ?", userId).First(&enterprise).Error
	if err == nil {
		return &EnterpriseAffiliation{EnterpriseId: enterprise.Id, IsOwner: true}, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	var member EnterpriseMember
	err = DB.Select("id", "enterprise_id").Where("user_id = ?", userId).First(&member).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &EnterpriseAffiliation{EnterpriseId: member.EnterpriseId, MemberId: member.Id}, nil
}

// SetEnterpriseMemberRole 改角色（成员必须已绑定登录账号）
func SetEnterpriseMemberRole(enterpriseId int, memberId int, role string) error {
	if err := validateEnterpriseRole(role); err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		member, err := getEnterpriseMember(lockForUpdate(tx), enterpriseId, memberId)
		if err != nil {
			return err
		}
		if member.UserId == 0 {
			return ErrEnterpriseMemberNoLogin
		}
		return tx.Model(&EnterpriseMember{}).Where("id = ?", memberId).Updates(map[string]any{"role": role, "updated_at": common.GetTimestamp()}).Error
	})
}

// ---------------------------------------------------------------------------
// API Key 归属
// ---------------------------------------------------------------------------

// EnterpriseTokenListItem 企业 key 列表行（key 只返回脱敏值；本月 / 上月消耗从 ent_usage_daily 回填）
type EnterpriseTokenListItem struct {
	Id                 int    `json:"id"`
	Name               string `json:"name"`
	Key                string `json:"key" gorm:"column:token_key"`
	Status             int    `json:"status"`
	RemainQuota        int    `json:"remain_quota"`
	UnlimitedQuota     bool   `json:"unlimited_quota"`
	UsedQuota          int    `json:"used_quota"`
	ExpiredTime        int64  `json:"expired_time"`
	CreatedTime        int64  `json:"created_time"`
	AccessedTime       int64  `json:"accessed_time"`
	Group              string `json:"group" gorm:"column:token_group"`
	ModelLimitsEnabled bool   `json:"model_limits_enabled"`
	ModelLimits        string `json:"model_limits"`
	AllowIps           string `json:"allow_ips"`
	TeamId             int    `json:"team_id"`
	TeamName           string `json:"team_name"`
	TeamStatus         string `json:"team_status"`
	MemberId           int    `json:"member_id"`
	MemberName         string `json:"member_name"`
	MonthQuota         int64  `json:"month_quota" gorm:"-"`
	PrevMonthQuota     int64  `json:"prev_month_quota" gorm:"-"`
	// 周期限额（M4）：没有策略时 reset_period 为空、其余为 0
	ResetPeriod string `json:"reset_period"`
	PeriodQuota int64  `json:"period_quota"`
	NextResetAt int64  `json:"next_reset_at"`
	// EffectiveStatus 派生四态（见 enterpriseTokenEffectiveStatusSQL）；Status 仍是 tokens.status 原值
	EffectiveStatus int `json:"effective_status"`
}

// EnterpriseTokenExpiringWindow 「即将过期」筛选的窗口：7 天内
const EnterpriseTokenExpiringWindow = 7 * 24 * 3600

type EnterpriseTokenFilter struct {
	TeamId   *int
	MemberId *int
	// Status 按派生四态过滤（1 启用 / 2 停用 / 3 过期 / 4 耗尽），与概览口径一致
	Status *int
	// Expiring 只看仍在启用、7 天内到期的 key
	Expiring bool
	Keyword  string
}

// enterpriseTokenEffectiveStatusSQL 企业 key 的派生四态表达式，概览计数与密钥页筛选 / 列表共用。
// Redis 模式下上游不会把耗尽 / 过期回写到 tokens.status，这里按余额与到期时间派生：
// 过期 > 耗尽 > 停用 > 启用，一把 key 只归一档；停用的 key 即使到期 / 余额为 0 仍算停用。
// 只有编译期常量与时间戳参与拼接，不含用户输入。
func enterpriseTokenEffectiveStatusSQL(now int64) string {
	return fmt.Sprintf("(CASE WHEN tokens.status = %d OR (tokens.status = %d AND tokens.expired_time > 0 AND tokens.expired_time < %d) THEN %d "+
		"WHEN tokens.status = %d OR (tokens.status = %d AND NOT tokens.unlimited_quota AND tokens.remain_quota <= 0) THEN %d "+
		"ELSE tokens.status END)",
		common.TokenStatusExpired, common.TokenStatusEnabled, now, common.TokenStatusExpired,
		common.TokenStatusExhausted, common.TokenStatusEnabled, common.TokenStatusExhausted)
}

// enterpriseTokenExpiringSQL 「即将过期」谓词：仍在启用、且 (now, now+7d] 内到期
func enterpriseTokenExpiringSQL(now int64) string {
	return fmt.Sprintf("(tokens.status = %d AND tokens.expired_time > %d AND tokens.expired_time <= %d)",
		common.TokenStatusEnabled, now, now+EnterpriseTokenExpiringWindow)
}

// enterpriseMonthRange 本月与上月的起止日（账期时区），列表页环比用
func enterpriseMonthRange(now time.Time) (thisFrom, thisTo, prevFrom, prevTo string) {
	local := now.In(enterpriseBillingLocation)
	thisStart := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, enterpriseBillingLocation)
	prevStart := thisStart.AddDate(0, -1, 0)
	return thisStart.Format("2006-01-02"), local.Format("2006-01-02"),
		prevStart.Format("2006-01-02"), thisStart.AddDate(0, 0, -1).Format("2006-01-02")
}

func enterpriseTokenQuery(enterpriseId int, ownerUserId int, scope EnterpriseScope) *gorm.DB {
	query := DB.Table("tokens").
		Joins("LEFT JOIN ent_token_assignments a ON a.token_id = tokens.id AND a.enterprise_id = ?", enterpriseId).
		Joins("LEFT JOIN ent_teams tm ON tm.id = a.team_id").
		Joins("LEFT JOIN ent_members m ON m.id = a.member_id").
		Joins("LEFT JOIN ent_token_quota_policies qp ON qp.token_id = tokens.id").
		Where("tokens.user_id = ? AND tokens.deleted_at IS NULL", ownerUserId)
	if scope.TeamId != nil {
		query = query.Where("a.team_id = ?", *scope.TeamId)
	}
	return query
}

const enterpriseTokenSelect = `tokens.id, tokens.name, tokens.` + "%s" + ` AS token_key, tokens.status, tokens.remain_quota,
	tokens.unlimited_quota, tokens.used_quota, tokens.expired_time, tokens.created_time, tokens.accessed_time,
	tokens.` + "%s" + ` AS token_group, tokens.model_limits_enabled, COALESCE(tokens.model_limits, '') AS model_limits,
	COALESCE(tokens.allow_ips, '') AS allow_ips,
	COALESCE(a.team_id, 0) AS team_id, COALESCE(tm.name, '') AS team_name, COALESCE(tm.status, '') AS team_status,
	COALESCE(a.member_id, 0) AS member_id, COALESCE(m.name, '') AS member_name,
	COALESCE(qp.reset_period, '') AS reset_period, COALESCE(qp.period_quota, 0) AS period_quota, COALESCE(qp.next_reset_at, 0) AS next_reset_at,
	%s AS effective_status`

func ListEnterpriseTokens(enterpriseId int, ownerUserId int, scope EnterpriseScope, filter EnterpriseTokenFilter, startIdx int, num int) ([]*EnterpriseTokenListItem, int64, error) {
	now := common.GetTimestamp()
	effectiveStatus := enterpriseTokenEffectiveStatusSQL(now)
	query := enterpriseTokenQuery(enterpriseId, ownerUserId, scope)
	if filter.TeamId != nil {
		query = query.Where("COALESCE(a.team_id, 0) = ?", *filter.TeamId)
	}
	if filter.MemberId != nil {
		query = query.Where("COALESCE(a.member_id, 0) = ?", *filter.MemberId)
	}
	if filter.Status != nil {
		query = query.Where(effectiveStatus+" = ?", *filter.Status)
	}
	if filter.Expiring {
		query = query.Where(enterpriseTokenExpiringSQL(now))
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("(tokens.name ILIKE ? OR m.name ILIKE ? OR tm.name ILIKE ?)", like, like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]*EnterpriseTokenListItem, 0)
	err := query.
		Select(fmt.Sprintf(enterpriseTokenSelect, commonKeyCol, commonGroupCol, effectiveStatus)).
		Order("tokens.id DESC").
		Limit(num).Offset(startIdx).
		Scan(&items).Error
	if err != nil {
		return nil, 0, err
	}
	ids := make([]int, 0, len(items))
	for _, item := range items {
		item.Key = MaskTokenKey(item.Key)
		ids = append(ids, item.Id)
	}
	thisFrom, thisTo, prevFrom, prevTo := enterpriseMonthRange(time.Now())
	thisMonth, err := SumEnterpriseUsageByColumn(enterpriseId, "token_id", ids, thisFrom, thisTo)
	if err != nil {
		return nil, 0, err
	}
	prevMonth, err := SumEnterpriseUsageByColumn(enterpriseId, "token_id", ids, prevFrom, prevTo)
	if err != nil {
		return nil, 0, err
	}
	for _, item := range items {
		item.MonthQuota = thisMonth[item.Id]
		item.PrevMonthQuota = prevMonth[item.Id]
	}
	return items, total, nil
}

// GetEnterpriseToken 取范围内的一把 key（含归属）；范围外或不属于企业主账号的按不存在处理
func GetEnterpriseToken(enterpriseId int, ownerUserId int, scope EnterpriseScope, tokenId int) (*Token, *EnterpriseTokenAssignment, error) {
	token, err := GetTokenByIds(tokenId, ownerUserId)
	if err != nil {
		return nil, nil, ErrEnterpriseResourceNotFound
	}
	assignment, err := GetEnterpriseTokenAssignment(tokenId)
	if err != nil {
		return nil, nil, err
	}
	if assignment == nil || assignment.EnterpriseId != enterpriseId || !scope.Allows(assignment.TeamId) {
		return nil, nil, ErrEnterpriseResourceNotFound
	}
	return token, assignment, nil
}

// DeleteEnterpriseToken 软删 key 并删除归属行（同一事务）
func DeleteEnterpriseToken(enterpriseId int, ownerUserId int, scope EnterpriseScope, tokenId int) (*Token, error) {
	token, _, err := GetEnterpriseToken(enterpriseId, ownerUserId, scope, tokenId)
	if err != nil {
		return nil, err
	}
	if cacheErr := invalidateTokenCacheForMutation(token.Key); cacheErr != nil {
		common.SysLog(common.LogText("failed to invalidate token cache before delete: %s", cacheErr.Error()))
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&Token{}, "id = ? AND user_id = ?", tokenId, ownerUserId).Error; err != nil {
			return err
		}
		if err := tx.Where("token_id = ?", tokenId).Delete(&EnterpriseTokenQuotaPolicy{}).Error; err != nil {
			return err
		}
		return tx.Where("token_id = ?", tokenId).Delete(&EnterpriseTokenAssignment{}).Error
	})
	if err != nil {
		return nil, err
	}
	InvalidateTokenAttribution(tokenId)
	return token, nil
}

// listEnterpriseTokensInScope 批量操作前把 id 解析成范围内的 key；任一 id 不在范围内整批按不存在处理
func listEnterpriseTokensInScope(enterpriseId int, ownerUserId int, scope EnterpriseScope, ids []int) ([]Token, error) {
	if len(ids) == 0 {
		return nil, ErrEnterpriseResourceNotFound
	}
	var tokens []Token
	err := enterpriseTokenQuery(enterpriseId, ownerUserId, scope).
		Where("tokens.id IN ? AND a.token_id IS NOT NULL", ids).
		Select("tokens.*").
		Find(&tokens).Error
	if err != nil {
		return nil, err
	}
	if len(tokens) != len(uniqueInts(ids)) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return tokens, nil
}

func uniqueInts(values []int) []int {
	seen := make(map[int]struct{}, len(values))
	result := make([]int, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

// EnterpriseTokenBatchResult 批量启停 / 删除的结果：跳过的是过期 / 耗尽不能启用的 key
type EnterpriseTokenBatchResult struct {
	Updated int   `json:"updated"`
	Skipped []int `json:"skipped"`
}

// BatchUpdateEnterpriseTokenStatus 批量启用 / 停用；启用时跳过已过期或额度耗尽的 key（与上游单条启用的校验一致）
func BatchUpdateEnterpriseTokenStatus(enterpriseId int, ownerUserId int, scope EnterpriseScope, ids []int, status int) (*EnterpriseTokenBatchResult, error) {
	tokens, err := listEnterpriseTokensInScope(enterpriseId, ownerUserId, scope, ids)
	if err != nil {
		return nil, err
	}
	result := &EnterpriseTokenBatchResult{Skipped: []int{}}
	targets := make([]int, 0, len(tokens))
	now := common.GetTimestamp()
	for _, token := range tokens {
		if status == common.TokenStatusEnabled {
			expired := token.ExpiredTime != -1 && token.ExpiredTime <= now
			exhausted := !token.UnlimitedQuota && token.RemainQuota <= 0
			if expired || exhausted {
				result.Skipped = append(result.Skipped, token.Id)
				continue
			}
		}
		targets = append(targets, token.Id)
	}
	if len(targets) == 0 {
		return result, nil
	}
	if err := invalidateTokensCache(tokens); err != nil {
		common.SysLog(common.LogText("failed to invalidate token cache before batch status update: %s", err.Error()))
	}
	update := DB.Model(&Token{}).Where("id IN ? AND user_id = ?", targets, ownerUserId).Update("status", status)
	if update.Error != nil {
		return nil, update.Error
	}
	result.Updated = int(update.RowsAffected)
	return result, nil
}

// BatchDeleteEnterpriseTokens 批量软删 key 与归属行
func BatchDeleteEnterpriseTokens(enterpriseId int, ownerUserId int, scope EnterpriseScope, ids []int) (int, error) {
	tokens, err := listEnterpriseTokensInScope(enterpriseId, ownerUserId, scope, ids)
	if err != nil {
		return 0, err
	}
	if err := invalidateTokensCache(tokens); err != nil {
		common.SysLog(common.LogText("failed to invalidate token cache before batch delete: %s", err.Error()))
	}
	targets := make([]int, 0, len(tokens))
	for _, token := range tokens {
		targets = append(targets, token.Id)
	}
	var deleted int64
	err = DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("id IN ? AND user_id = ?", targets, ownerUserId).Delete(&Token{})
		if result.Error != nil {
			return result.Error
		}
		deleted = result.RowsAffected
		if err := tx.Where("token_id IN ?", targets).Delete(&EnterpriseTokenQuotaPolicy{}).Error; err != nil {
			return err
		}
		return tx.Where("token_id IN ?", targets).Delete(&EnterpriseTokenAssignment{}).Error
	})
	if err != nil {
		return 0, err
	}
	for _, id := range targets {
		InvalidateTokenAttribution(id)
	}
	return int(deleted), nil
}

// validateTokenAssignmentTargets 校验团队未归档、持有人在职且属于该团队，返回解析后的团队 id
func validateTokenAssignmentTargets(tx *gorm.DB, enterpriseId int, teamId int, memberId int) (int, error) {
	teamId, err := ensureMemberTeam(tx, enterpriseId, teamId)
	if err != nil {
		return 0, err
	}
	if memberId != 0 {
		member, err := getEnterpriseMember(tx, enterpriseId, memberId)
		if err != nil {
			return 0, err
		}
		if member.Status != EnterpriseMemberStatusActive {
			return 0, ErrEnterpriseMemberNotActive
		}
		if member.TeamId != teamId {
			return 0, ErrEnterpriseMemberTeamMismatch
		}
	}
	return teamId, nil
}

func upsertTokenAssignment(tx *gorm.DB, enterpriseId int, tokenId int, teamId int, memberId int) error {
	now := common.GetTimestamp()
	assignment := EnterpriseTokenAssignment{
		TokenId:      tokenId,
		EnterpriseId: enterpriseId,
		TeamId:       teamId,
		MemberId:     memberId,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "token_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"enterprise_id", "team_id", "member_id", "updated_at"}),
	}).Create(&assignment).Error
}

// AssignEnterpriseToken 修改 key 的团队/持有人归属，只影响之后的请求统计；范围外的 key 或目标团队视为不存在
func AssignEnterpriseToken(enterpriseId int, ownerUserId int, scope EnterpriseScope, tokenId int, teamId int, memberId int) error {
	err := DB.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&Token{}).Where("id = ? AND user_id = ?", tokenId, ownerUserId).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return ErrEnterpriseResourceNotFound
		}
		if scope.TeamId != nil {
			var current EnterpriseTokenAssignment
			if err := tx.Where("token_id = ?", tokenId).First(&current).Error; err != nil || current.TeamId != *scope.TeamId {
				return ErrEnterpriseResourceNotFound
			}
		}
		resolved, err := validateTokenAssignmentTargets(tx, enterpriseId, teamId, memberId)
		if err != nil {
			return err
		}
		if !scope.Allows(resolved) {
			return ErrEnterpriseResourceNotFound
		}
		return upsertTokenAssignment(tx, enterpriseId, tokenId, resolved, memberId)
	})
	InvalidateTokenAttribution(tokenId)
	return err
}

// CreateEnterpriseToken 为企业主账号创建 key 并写入归属（同一事务）；teamId 为 0 落默认团队
func CreateEnterpriseToken(enterpriseId int, scope EnterpriseScope, token *Token, teamId int, memberId int) error {
	return CreateEnterpriseTokenWithPolicy(enterpriseId, scope, token, teamId, memberId, nil)
}

// CreateEnterpriseTokenWithPolicy 创建 key、写归属，并在同一事务里写周期限额策略（policy 为 nil 或 never 时不写）；
// 带策略时 key 的初始额度就是周期额度
func CreateEnterpriseTokenWithPolicy(enterpriseId int, scope EnterpriseScope, token *Token, teamId int, memberId int, policy *TokenQuotaPolicyInput) error {
	hasPolicy := policy != nil && policy.ResetPeriod != TokenQuotaResetNever
	if hasPolicy {
		token.RemainQuota = int(policy.PeriodQuota)
		token.UnlimitedQuota = false
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		resolved, err := validateTokenAssignmentTargets(tx, enterpriseId, teamId, memberId)
		if err != nil {
			return err
		}
		if !scope.Allows(resolved) {
			return ErrEnterpriseResourceNotFound
		}
		if err := tx.Create(token).Error; err != nil {
			return err
		}
		if hasPolicy {
			if err := createTokenQuotaPolicy(tx, enterpriseId, token.Id, *policy, common.GetTimestamp()); err != nil {
				return err
			}
		}
		return upsertTokenAssignment(tx, enterpriseId, token.Id, resolved, memberId)
	})
}

// GetEnterpriseTokenAssignment key 的归属（没有归属行返回 nil）
func GetEnterpriseTokenAssignment(tokenId int) (*EnterpriseTokenAssignment, error) {
	var assignment EnterpriseTokenAssignment
	err := DB.Where("token_id = ?", tokenId).First(&assignment).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &assignment, err
}

// ---------------------------------------------------------------------------
// 成员批量导入
// ---------------------------------------------------------------------------

const EnterpriseMemberImportMaxRows = 1000

// EnterpriseMemberImportRow 导入的一行；Team 按名称匹配已有团队，找不到则新建；留空落默认团队
type EnterpriseMemberImportRow struct {
	Name       string `json:"name"`
	Email      string `json:"email"`
	EmployeeNo string `json:"employee_no"`
	Team       string `json:"team"`
}

// EnterpriseMemberImportError 行级错误，Row 从 1 开始计数
type EnterpriseMemberImportError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

type EnterpriseMemberImportResult struct {
	Created      int                           `json:"created"`
	CreatedTeams []string                      `json:"created_teams"`
	Errors       []EnterpriseMemberImportError `json:"errors"`
}

// errImportRejected 用于回滚事务：行校验失败时不写入任何数据
var errImportRejected = errors.New("import rejected")

// ImportEnterpriseMembers 批量导入成员：先整体校验，任一行有错则全部不写入（全成功或全失败）。
// scope 限定团队时，所有行只能落在该团队（Team 列必须为空或等于该团队名），且不自动建团队。
func ImportEnterpriseMembers(enterpriseId int, scope EnterpriseScope, rows []EnterpriseMemberImportRow) (*EnterpriseMemberImportResult, error) {
	result := &EnterpriseMemberImportResult{CreatedTeams: []string{}, Errors: []EnterpriseMemberImportError{}}
	if len(rows) == 0 {
		return result, errors.New("no rows to import")
	}
	if len(rows) > EnterpriseMemberImportMaxRows {
		return result, fmt.Errorf("at most %d rows per import", EnterpriseMemberImportMaxRows)
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		defaultTeamId, err := ensureDefaultTeam(tx, enterpriseId)
		if err != nil {
			return err
		}
		var teams []EnterpriseTeam
		if err := tx.Where("enterprise_id = ? AND status = ?", enterpriseId, EnterpriseTeamStatusActive).Order("sort ASC, id ASC").Find(&teams).Error; err != nil {
			return err
		}
		teamIds := map[string]int{}
		for _, team := range teams {
			key := strings.ToLower(team.Name)
			if _, exists := teamIds[key]; !exists {
				teamIds[key] = team.Id
			}
		}
		scopedTeamName := ""
		if scope.TeamId != nil {
			team, err := getEnterpriseTeam(tx, enterpriseId, *scope.TeamId)
			if err != nil {
				return err
			}
			scopedTeamName = strings.ToLower(team.Name)
		}
		var existingNos []string
		if err := tx.Model(&EnterpriseMember{}).Where("enterprise_id = ? AND employee_no <> ''", enterpriseId).Pluck("employee_no", &existingNos).Error; err != nil {
			return err
		}
		usedNos := map[string]bool{}
		for _, no := range existingNos {
			usedNos[no] = true
		}

		members := make([]*EnterpriseMember, 0, len(rows))
		teamKeys := make([]string, 0, len(rows)) // 与 members 一一对应的团队键（小写名），空表示默认团队
		newTeams := map[string]string{}          // 小写名 -> 原始名
		for i, row := range rows {
			member := &EnterpriseMember{
				EnterpriseId: enterpriseId,
				Name:         row.Name,
				Email:        row.Email,
				EmployeeNo:   row.EmployeeNo,
				Status:       EnterpriseMemberStatusActive,
				Role:         EnterpriseMemberRoleNone,
			}
			if err := member.normalize(); err != nil {
				result.Errors = append(result.Errors, EnterpriseMemberImportError{Row: i + 1, Message: err.Error()})
				continue
			}
			if member.EmployeeNo != "" {
				if usedNos[member.EmployeeNo] {
					result.Errors = append(result.Errors, EnterpriseMemberImportError{Row: i + 1, Message: "duplicate employee number: " + member.EmployeeNo})
					continue
				}
				usedNos[member.EmployeeNo] = true
			}
			teamKey := ""
			if teamName := strings.TrimSpace(row.Team); teamName != "" {
				if len([]rune(teamName)) > 64 {
					result.Errors = append(result.Errors, EnterpriseMemberImportError{Row: i + 1, Message: "team name is too long"})
					continue
				}
				teamKey = strings.ToLower(teamName)
				if scope.TeamId != nil && teamKey != scopedTeamName {
					result.Errors = append(result.Errors, EnterpriseMemberImportError{Row: i + 1, Message: "team is outside your scope: " + teamName})
					continue
				}
				if _, exists := teamIds[teamKey]; !exists {
					if _, pending := newTeams[teamKey]; !pending {
						newTeams[teamKey] = teamName // 首次出现的写法作为团队名
					}
				}
			} else if scope.TeamId != nil {
				teamKey = scopedTeamName
			}
			members = append(members, member)
			teamKeys = append(teamKeys, teamKey)
		}
		if len(result.Errors) > 0 {
			return errImportRejected
		}

		now := common.GetTimestamp()
		for key, name := range newTeams {
			team := &EnterpriseTeam{EnterpriseId: enterpriseId, Name: name, Status: EnterpriseTeamStatusActive, BudgetAlertPercent: 80, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(team).Error; err != nil {
				return err
			}
			teamIds[key] = team.Id
			result.CreatedTeams = append(result.CreatedTeams, name)
		}
		for i, member := range members {
			member.TeamId = defaultTeamId
			if teamKeys[i] != "" {
				member.TeamId = teamIds[teamKeys[i]]
			}
			member.CreatedAt = now
			member.UpdatedAt = now
		}
		if err := tx.Create(&members).Error; err != nil {
			return err
		}
		result.Created = len(members)
		return nil
	})
	if errors.Is(err, errImportRejected) {
		return result, nil
	}
	return result, err
}
