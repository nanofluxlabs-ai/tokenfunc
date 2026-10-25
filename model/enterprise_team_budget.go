package model

import (
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 团队月度预算（TokenFunc 二开，M14）
//
// 每个团队可设月度预算（ent_teams.monthly_budget_quota，0 = 不设）与告警阈值；消费写入日聚合后按本月消耗判档：
//   - warn：used*100 >= budget*alert_percent（alert_percent=0 关闭告警档）
//   - exceeded：used >= budget，或勾了拦截后预扣被拒
// 同一团队同一月同一档只发一次：先看进程内标记，再由 ent_team_budget_notify 的 ON CONFLICT 抢占（多副本安全）。
// 上调预算后清当月记录允许再触发；换月后 month 键不同，自然重置。
// 拦截（budget_enforce）在预扣前判定，本月消耗走 60 秒进程内缓存，接受窗口内略超。

// 团队预算通知档位
const (
	TeamBudgetKindWarn     = "warn"     // 已用达到告警阈值
	TeamBudgetKindExceeded = "exceeded" // 预算用尽（或预扣被拦截）
)

// 团队预算状态（列表接口下发）
const (
	TeamBudgetStateNone     = "none" // 未设预算
	TeamBudgetStateOk       = "ok"
	TeamBudgetStateWarn     = "warn"
	TeamBudgetStateExceeded = "exceeded"
)

// EnterpriseTeamBudgetNotify 团队预算通知发送记录：(team_id, month, kind) 为主键，多副本靠 ON CONFLICT 抢占
type EnterpriseTeamBudgetNotify struct {
	TeamId       int    `json:"team_id" gorm:"primaryKey;autoIncrement:false"`
	Month        string `json:"month" gorm:"type:varchar(7);primaryKey"`
	Kind         string `json:"kind" gorm:"type:varchar(16);primaryKey"`
	EnterpriseId int    `json:"enterprise_id" gorm:"not null;index"`
	CreatedAt    int64  `json:"created_at" gorm:"not null"`
}

func (EnterpriseTeamBudgetNotify) TableName() string { return "ent_team_budget_notify" }

// EnterpriseTeamBudget 团队预算配置（随 EnterpriseBillingInfo 缓存下发，只含设了预算的团队）
type EnterpriseTeamBudget struct {
	Quota        int64
	AlertPercent int
	Enforce      bool
}

// TeamBudgetAlert 跨过阈值后交给 service 层发送的事件
type TeamBudgetAlert struct {
	EnterpriseId int
	TeamId       int
	Month        string
	Kind         string
	UsedQuota    int64
	BudgetQuota  int64
	AlertPercent int
	Enforce      bool
}

// TeamBudgetAlertSender 由 service 层在启动时注入（model 不能依赖 service）；为空时只记日志
var TeamBudgetAlertSender func(alert TeamBudgetAlert)

// EnterpriseBudgetMonth 预算月键（账期时区的 YYYY-MM）
func EnterpriseBudgetMonth(now time.Time) string {
	return now.In(enterpriseBillingLocation).Format("2006-01")
}

// enterpriseMonthRange 当前自然月的首末日（账期时区），供日聚合按 day 区间求和
func enterpriseMonthRange(now time.Time) (string, string) {
	local := now.In(enterpriseBillingLocation)
	first := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, enterpriseBillingLocation)
	last := first.AddDate(0, 1, -1)
	return first.Format("2006-01-02"), last.Format("2006-01-02")
}

// loadEnterpriseTeamBudgets 读取企业内设了预算的团队；团队表尚未建立（未迁移的测试库）时按无预算处理
func loadEnterpriseTeamBudgets(enterpriseId int) (map[int]EnterpriseTeamBudget, error) {
	rows := make([]struct {
		Id                 int
		MonthlyBudgetQuota int64
		BudgetAlertPercent int
		BudgetEnforce      bool
	}, 0)
	err := DB.Model(&EnterpriseTeam{}).
		Select("id", "monthly_budget_quota", "budget_alert_percent", "budget_enforce").
		Where("enterprise_id = ? AND monthly_budget_quota > 0", enterpriseId).
		Scan(&rows).Error
	if err != nil {
		if !DB.Migrator().HasTable(&EnterpriseTeam{}) {
			return nil, nil
		}
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	budgets := make(map[int]EnterpriseTeamBudget, len(rows))
	for _, row := range rows {
		budgets[row.Id] = EnterpriseTeamBudget{Quota: row.MonthlyBudgetQuota, AlertPercent: row.BudgetAlertPercent, Enforce: row.BudgetEnforce}
	}
	return budgets, nil
}

// ---------------------------------------------------------------------------
// 团队本月消耗缓存（进程内 60 秒；本节点写入的用量即时累加，其他副本的最多延迟一个 TTL）
// ---------------------------------------------------------------------------

const teamMonthUsageTTL = 60 * time.Second

type teamMonthUsageEntry struct {
	month     string
	quota     int64
	expiresAt time.Time
}

var (
	teamMonthUsageMu    sync.Mutex
	teamMonthUsageCache = map[int]teamMonthUsageEntry{}
)

// GetTeamMonthUsage 团队本月已消耗 quota（缓存命中时不查库）
func GetTeamMonthUsage(enterpriseId int, teamId int) (int64, error) {
	now := time.Now()
	month := EnterpriseBudgetMonth(now)
	teamMonthUsageMu.Lock()
	entry, ok := teamMonthUsageCache[teamId]
	teamMonthUsageMu.Unlock()
	if ok && entry.month == month && now.Before(entry.expiresAt) {
		return entry.quota, nil
	}
	first, last := enterpriseMonthRange(now)
	sums, err := SumEnterpriseUsageByColumn(enterpriseId, "team_id", []int{teamId}, first, last)
	if err != nil {
		return 0, err
	}
	quota := sums[teamId]
	teamMonthUsageMu.Lock()
	teamMonthUsageCache[teamId] = teamMonthUsageEntry{month: month, quota: quota, expiresAt: now.Add(teamMonthUsageTTL)}
	teamMonthUsageMu.Unlock()
	return quota, nil
}

// addTeamMonthUsage 本节点刚写入的用量直接累加到缓存，告警判档不必等缓存过期
func addTeamMonthUsage(teamId int, delta int64) {
	month := EnterpriseBudgetMonth(time.Now())
	teamMonthUsageMu.Lock()
	defer teamMonthUsageMu.Unlock()
	entry, ok := teamMonthUsageCache[teamId]
	if !ok || entry.month != month {
		return
	}
	entry.quota += delta
	teamMonthUsageCache[teamId] = entry
}

// InvalidateTeamMonthUsage 预算调整后让下一次判定重新读库
func InvalidateTeamMonthUsage(teamId int) {
	teamMonthUsageMu.Lock()
	delete(teamMonthUsageCache, teamId)
	teamMonthUsageMu.Unlock()
}

// ---------------------------------------------------------------------------
// 判档与通知
// ---------------------------------------------------------------------------

// teamBudgetState 本月消耗相对预算的百分比与状态
func teamBudgetState(budget EnterpriseTeamBudget, used int64) (int, string) {
	if budget.Quota <= 0 {
		return 0, TeamBudgetStateNone
	}
	percent := int(used * 100 / budget.Quota)
	switch {
	case used >= budget.Quota:
		return percent, TeamBudgetStateExceeded
	case budget.AlertPercent > 0 && used*100 >= budget.Quota*int64(budget.AlertPercent):
		return percent, TeamBudgetStateWarn
	}
	return percent, TeamBudgetStateOk
}

// teamBudgetNotified 进程内已发标记："teamId|month|kind|budget|percent"；预算或阈值变化后键不同，可再次抢占
var teamBudgetNotified sync.Map

// ClaimTeamBudgetNotify 抢占某团队某月某档的发送权：插入成功返回 true，已存在（本节点或其他副本已发）返回 false
func ClaimTeamBudgetNotify(teamId int, month string, kind string, enterpriseId int) (bool, error) {
	record := &EnterpriseTeamBudgetNotify{TeamId: teamId, Month: month, Kind: kind, EnterpriseId: enterpriseId, CreatedAt: common.GetTimestamp()}
	result := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(record)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

// resetTeamBudgetNotifyTx 删除某团队当月指定档位的发送记录，允许再次触发
func resetTeamBudgetNotifyTx(tx *gorm.DB, teamId int, month string, kinds ...string) error {
	return tx.Where("team_id = ? AND month = ? AND kind IN ?", teamId, month, kinds).Delete(&EnterpriseTeamBudgetNotify{}).Error
}

// notifyTeamBudget 对某一档抢占发送权并交给 sender；同一节点对同一键只打一次 DB
func notifyTeamBudget(enterpriseId int, teamId int, budget EnterpriseTeamBudget, used int64, kind string) {
	month := EnterpriseBudgetMonth(time.Now())
	key := fmt.Sprintf("%d|%s|%s|%d|%d", teamId, month, kind, budget.Quota, budget.AlertPercent)
	if _, sent := teamBudgetNotified.Load(key); sent {
		return
	}
	claimed, err := ClaimTeamBudgetNotify(teamId, month, kind, enterpriseId)
	if err != nil {
		common.SysError(fmt.Sprintf("enterprise team budget: claim team %d %s %s failed: %v", teamId, month, kind, err))
		return
	}
	// 无论本节点还是其他副本已发，之后都不必再打 DB
	teamBudgetNotified.Store(key, struct{}{})
	if !claimed {
		return
	}
	alert := TeamBudgetAlert{EnterpriseId: enterpriseId, TeamId: teamId, Month: month, Kind: kind, UsedQuota: used, BudgetQuota: budget.Quota, AlertPercent: budget.AlertPercent, Enforce: budget.Enforce}
	if TeamBudgetAlertSender == nil {
		common.SysLog(fmt.Sprintf("enterprise team budget: team %d %s %s (used %d / budget %d), no sender registered", teamId, month, kind, used, budget.Quota))
		return
	}
	TeamBudgetAlertSender(alert)
}

// checkTeamBudgetAfterUsage 用量写入后判档：达到预算发 exceeded，达到阈值发 warn；每团队每月每档一次
func checkTeamBudgetAfterUsage(enterpriseId int, teamId int, budget EnterpriseTeamBudget, used int64) {
	_, state := teamBudgetState(budget, used)
	switch state {
	case TeamBudgetStateExceeded:
		notifyTeamBudget(enterpriseId, teamId, budget, used, TeamBudgetKindExceeded)
	case TeamBudgetStateWarn:
		notifyTeamBudget(enterpriseId, teamId, budget, used, TeamBudgetKindWarn)
	}
}

// RaiseTeamBudgetExceeded 预扣被拦截时由计费入口调用：即将 403，直接按「用尽」通知
func RaiseTeamBudgetExceeded(enterpriseId int, teamId int, budget EnterpriseTeamBudget, used int64) {
	notifyTeamBudget(enterpriseId, teamId, budget, used, TeamBudgetKindExceeded)
}

// TokenTeamId key 所属团队（归属缓存 30 秒）；未分配归属返回 0
func TokenTeamId(tokenId int) (int, error) {
	attribution, err := getTokenAttribution(tokenId)
	return attribution.TeamId, err
}

// fillTeamBudgetStates 团队列表回填本月消耗、预算百分比与状态
func fillTeamBudgetStates(enterpriseId int, items []*EnterpriseTeamListItem) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]int, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.Id)
	}
	first, last := enterpriseMonthRange(time.Now())
	usage, err := SumEnterpriseUsageByColumn(enterpriseId, "team_id", ids, first, last)
	if err != nil {
		return err
	}
	for _, item := range items {
		item.MonthQuota = usage[item.Id]
		budget := EnterpriseTeamBudget{Quota: item.MonthlyBudgetQuota, AlertPercent: item.BudgetAlertPercent, Enforce: item.BudgetEnforce}
		item.BudgetPercent, item.BudgetState = teamBudgetState(budget, item.MonthQuota)
	}
	return nil
}

// ListTeamAdminUserIds 某团队已绑定登录账号的在职团队管理员（通知推送用）
func ListTeamAdminUserIds(enterpriseId int, teamId int) ([]int, error) {
	userIds := make([]int, 0)
	err := DB.Model(&EnterpriseMember{}).
		Where("enterprise_id = ? AND team_id = ? AND role = ? AND user_id > 0 AND status = ?", enterpriseId, teamId, EnterpriseMemberRoleTeamAdmin, EnterpriseMemberStatusActive).
		Pluck("user_id", &userIds).Error
	return userIds, err
}
