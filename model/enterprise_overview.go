package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
)

// 企业概览（TokenFunc 二开，M6）：四张 KPI 卡与待办全部来自小表（tokens / ent_* / ent_usage_daily），不扫 logs。
// 范围由调用方传入：企业主 / 企业管理员看全企业，团队角色只看本团队。

// EnterpriseTokenCounts 企业 key 的四态计数。
// Redis 模式下耗尽 / 过期不会回写 tokens.status，这里按余额与到期时间派生：过期 > 耗尽 > 停用 > 启用，一把 key 只归一档。
type EnterpriseTokenCounts struct {
	Total     int `json:"total"`
	Active    int `json:"active"`
	Disabled  int `json:"disabled"`
	Exhausted int `json:"exhausted"`
	Expired   int `json:"expired"`
	// Expiring7d 仍在启用、且 7 天内到期的 key
	Expiring7d int `json:"expiring_7d"`
}

// CountEnterpriseTokens 一条 SQL 统计范围内的 key 四态（范围限定团队时只数该团队的 key）
func CountEnterpriseTokens(enterpriseId int, ownerUserId int, scope EnterpriseScope, now int64) (*EnterpriseTokenCounts, error) {
	const expired = "(tokens.status = ? OR (tokens.status = ? AND tokens.expired_time > 0 AND tokens.expired_time < ?))"
	const exhausted = "(tokens.status = ? OR (tokens.status = ? AND NOT tokens.unlimited_quota AND tokens.remain_quota <= 0))"
	var row struct {
		Total      int
		Disabled   int
		Exhausted  int
		Expired    int
		Expiring7d int
	}
	err := enterpriseTokenQuery(enterpriseId, ownerUserId, scope).
		Select("COUNT(*) AS total, "+
			"COUNT(*) FILTER (WHERE tokens.status = ?) AS disabled, "+
			"COUNT(*) FILTER (WHERE "+expired+") AS expired, "+
			"COUNT(*) FILTER (WHERE "+exhausted+" AND NOT "+expired+") AS exhausted, "+
			"COUNT(*) FILTER (WHERE tokens.status = ? AND tokens.expired_time > ? AND tokens.expired_time <= ?) AS expiring7d",
			common.TokenStatusDisabled,
			common.TokenStatusExpired, common.TokenStatusEnabled, now,
			common.TokenStatusExhausted, common.TokenStatusEnabled, common.TokenStatusExpired, common.TokenStatusEnabled, now,
			common.TokenStatusEnabled, now, now+EnterpriseTokenExpiringWindow).
		Scan(&row).Error
	if err != nil {
		return nil, err
	}
	return &EnterpriseTokenCounts{
		Total:      row.Total,
		Active:     row.Total - row.Disabled - row.Exhausted - row.Expired,
		Disabled:   row.Disabled,
		Exhausted:  row.Exhausted,
		Expired:    row.Expired,
		Expiring7d: row.Expiring7d,
	}, nil
}

// EnterpriseOrgCounts 组织规模：在用团队数、成员数、其中可登录控制台的成员数
type EnterpriseOrgCounts struct {
	Teams        int `json:"teams"`
	Members      int `json:"members"`
	LoginMembers int `json:"login_members"`
}

// CountEnterpriseOrg 团队 / 成员计数（范围限定团队时只数该团队）
func CountEnterpriseOrg(enterpriseId int, scope EnterpriseScope) (*EnterpriseOrgCounts, error) {
	teams := DB.Model(&EnterpriseTeam{}).Where("enterprise_id = ? AND status = ?", enterpriseId, EnterpriseTeamStatusActive)
	members := DB.Model(&EnterpriseMember{}).Where("enterprise_id = ?", enterpriseId)
	if scope.TeamId != nil {
		teams = teams.Where("id = ?", *scope.TeamId)
		members = members.Where("team_id = ?", *scope.TeamId)
	}
	var teamCount int64
	if err := teams.Count(&teamCount).Error; err != nil {
		return nil, err
	}
	var row struct {
		Members      int
		LoginMembers int
	}
	err := members.
		Select("COUNT(*) AS members, COUNT(*) FILTER (WHERE user_id > 0 AND role <> ?) AS login_members", EnterpriseMemberRoleNone).
		Scan(&row).Error
	if err != nil {
		return nil, err
	}
	return &EnterpriseOrgCounts{Teams: int(teamCount), Members: row.Members, LoginMembers: row.LoginMembers}, nil
}

// EnterpriseTeamBudgetItem 团队本月消耗与预算进度（概览待办 / 团队角色的第一张卡）
type EnterpriseTeamBudgetItem struct {
	TeamId        int    `json:"team_id"`
	TeamName      string `json:"team_name"`
	MonthQuota    int64  `json:"month_quota"`
	BudgetQuota   int64  `json:"budget_quota"`
	BudgetPercent int    `json:"budget_percent"`
	BudgetState   string `json:"budget_state"`
	BudgetEnforce bool   `json:"budget_enforce"`
}

// EnterpriseOverviewMonth 本月与上月消耗（环比用）
type EnterpriseOverviewMonth struct {
	Quota     int64 `json:"quota"`
	PrevQuota int64 `json:"prev_quota"`
}

// EnterpriseOverviewStats 概览里与角色无关的统计块；Teams 是范围内的在用团队（含预算状态），由调用方拆成待办
type EnterpriseOverviewStats struct {
	Month EnterpriseOverviewMonth     `json:"month"`
	Keys  *EnterpriseTokenCounts      `json:"keys"`
	Org   *EnterpriseOrgCounts        `json:"org"`
	Daily []*EnterpriseUsageDayItem   `json:"daily"`
	Teams []*EnterpriseTeamBudgetItem `json:"-"`
}

// LoadEnterpriseOverviewStats 读取概览统计：本月 / 上月消耗、key 四态、组织规模、近 30 天按天消耗、团队预算状态
func LoadEnterpriseOverviewStats(enterprise *Enterprise, scope EnterpriseScope, now time.Time) (*EnterpriseOverviewStats, error) {
	filter := EnterpriseUsageFilter{}.WithScope(scope)
	thisFrom, thisTo, prevFrom, prevTo := enterpriseMonthRange(now)
	thisMonth, err := SumEnterpriseUsageTotal(enterprise.Id, thisFrom, thisTo, filter)
	if err != nil {
		return nil, err
	}
	prevMonth, err := SumEnterpriseUsageTotal(enterprise.Id, prevFrom, prevTo, filter)
	if err != nil {
		return nil, err
	}
	keys, err := CountEnterpriseTokens(enterprise.Id, enterprise.UserId, scope, now.Unix())
	if err != nil {
		return nil, err
	}
	org, err := CountEnterpriseOrg(enterprise.Id, scope)
	if err != nil {
		return nil, err
	}
	rangeFrom, rangeTo := DefaultEnterpriseUsageRange()
	daily, err := SummarizeEnterpriseUsageByDay(enterprise.Id, rangeFrom, rangeTo, filter)
	if err != nil {
		return nil, err
	}
	teams, err := ListEnterpriseTeams(enterprise.Id, scope)
	if err != nil {
		return nil, err
	}
	budgets := make([]*EnterpriseTeamBudgetItem, 0, len(teams))
	for _, team := range teams {
		if team.Status != EnterpriseTeamStatusActive {
			continue
		}
		budgets = append(budgets, &EnterpriseTeamBudgetItem{
			TeamId: team.Id, TeamName: team.Name, MonthQuota: team.MonthQuota, BudgetQuota: team.MonthlyBudgetQuota,
			BudgetPercent: team.BudgetPercent, BudgetState: team.BudgetState, BudgetEnforce: team.BudgetEnforce,
		})
	}
	return &EnterpriseOverviewStats{
		Month: EnterpriseOverviewMonth{Quota: thisMonth.Quota, PrevQuota: prevMonth.Quota},
		Keys:  keys,
		Org:   org,
		Daily: daily,
		Teams: budgets,
	}, nil
}
