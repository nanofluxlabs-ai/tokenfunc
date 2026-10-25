package service

import (
	"errors"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"gorm.io/gorm"
)

// 推广中心查询层（TokenFunc 二开）：推广人名下用户在区间内的消耗统计。
// 数据来自 model.ReadLogDailyUsage（预聚合 + 实时补边），再按每条绑定的 usage_since 截断：
// usage_since 所在上海日之前的行不计（预聚合只到天，同一天内绑定前的消耗也算在内，属可接受的粒度误差）。
// 口径与财务中心一致：净额 = 消费 − 退款，次数与 token 只计消费。

// PromoterCenterMaxModels 模型消费列表上限
const PromoterCenterMaxModels = 500

var ErrPromoterUserNotBound = common.NewMessage("User is not bound to this promoter")

// PromoterProfile 推广人自身信息（aff_code 用于前端拼推广链接）
type PromoterProfile struct {
	Id          int    `json:"id"`
	UserId      int    `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AffCode     string `json:"aff_code"`
	Remark      string `json:"remark"`
	// ShareRate 分成比例（百分比，0 = 未设置），仅展示
	ShareRate float64 `json:"share_rate"`
	CreatedAt int64   `json:"created_at"`
}

// PromoterCenterSummary 区间汇总
type PromoterCenterSummary struct {
	BoundUserCount   int   `json:"bound_user_count"`
	ActiveUserCount  int   `json:"active_user_count"`
	ConsumeQuota     int64 `json:"consume_quota"`
	RefundQuota      int64 `json:"refund_quota"`
	NetQuota         int64 `json:"net_quota"`
	RequestCount     int64 `json:"request_count"`
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
}

// PromoterCenterDaily 每日一行（区间内没有数据的天补零）
type PromoterCenterDaily struct {
	Day              string `json:"day"`
	NetQuota         int64  `json:"net_quota"`
	RequestCount     int64  `json:"request_count"`
	PromptTokens     int64  `json:"prompt_tokens"`
	CompletionTokens int64  `json:"completion_tokens"`
}

// PromoterCenterRange 下发给前端的实际区间
type PromoterCenterRange struct {
	Start    int64  `json:"start"`
	EndExcl  int64  `json:"end_excl"`
	StartDay string `json:"start_day"`
	EndDay   string `json:"end_day"`
}

// PromoterCenterOverview 总览
type PromoterCenterOverview struct {
	Promoter PromoterProfile       `json:"promoter"`
	Range    PromoterCenterRange   `json:"range"`
	Summary  PromoterCenterSummary `json:"summary"`
	Daily    []PromoterCenterDaily `json:"daily"`
}

// PromoterCenterUser 名下用户一行；Email / Group / BoundByUsername 只在管理员视图下发
type PromoterCenterUser struct {
	UserId          int    `json:"user_id"`
	Username        string `json:"username"`
	DisplayName     string `json:"display_name"`
	IsEnterprise    bool   `json:"is_enterprise"`
	Deleted         bool   `json:"deleted"`
	Source          string `json:"source"`
	BoundAt         int64  `json:"bound_at"`
	UsageSince      int64  `json:"usage_since"`
	NetQuota        int64  `json:"net_quota"`
	RequestCount    int64  `json:"request_count"`
	TotalTokens     int64  `json:"total_tokens"`
	LastConsumeDay  string `json:"last_consume_day"`
	Email           string `json:"email,omitempty"`
	Group           string `json:"group,omitempty"`
	BoundByUsername string `json:"bound_by_username,omitempty"`
}

// PromoterCenterModel 模型消费一行
type PromoterCenterModel struct {
	ModelName        string  `json:"model_name"`
	NetQuota         int64   `json:"net_quota"`
	RequestCount     int64   `json:"request_count"`
	PromptTokens     int64   `json:"prompt_tokens"`
	CompletionTokens int64   `json:"completion_tokens"`
	TotalTokens      int64   `json:"total_tokens"`
	Percentage       float64 `json:"percentage"`
}

// PromoterCenterModels 模型消费列表 + 汇总
type PromoterCenterModels struct {
	Summary PromoterCenterSummary `json:"summary"`
	Items   []PromoterCenterModel `json:"items"`
}

// PromoterCenterUserUsage 单个名下用户的下钻
type PromoterCenterUserUsage struct {
	User    PromoterCenterUser    `json:"user"`
	Summary PromoterCenterSummary `json:"summary"`
	Daily   []PromoterCenterDaily `json:"daily"`
	Models  []PromoterCenterModel `json:"models"`
}

// promoterScope 推广人名下的活跃绑定及其口径起点
type promoterScope struct {
	bindings []*model.PromoterBinding
	userIds  []int
	sinceDay map[int]string
}

func loadPromoterScope(promoterUserId int) (promoterScope, error) {
	bindings, err := model.ListActiveBindings(promoterUserId)
	if err != nil {
		return promoterScope{}, err
	}
	return newPromoterScope(bindings), nil
}

func newPromoterScope(bindings []*model.PromoterBinding) promoterScope {
	scope := promoterScope{bindings: bindings, userIds: make([]int, 0, len(bindings)), sinceDay: make(map[int]string, len(bindings))}
	for _, binding := range bindings {
		scope.userIds = append(scope.userIds, binding.UserId)
		if binding.UsageSince > 0 {
			scope.sinceDay[binding.UserId] = model.FinanceDay(binding.UsageSince)
		}
	}
	return scope
}

// read 读取区间用量并按 usage_since 截断
func (s promoterScope) read(r model.FinanceRange) ([]model.LogDailyUsageRow, error) {
	rows, err := model.ReadLogDailyUsage(s.userIds, r)
	if err != nil {
		return nil, err
	}
	kept := rows[:0]
	for _, row := range rows {
		if since, ok := s.sinceDay[row.UserId]; ok && row.Day < since {
			continue
		}
		kept = append(kept, row)
	}
	return kept, nil
}

func promoterSummary(rows []model.LogDailyUsageRow, boundUserCount int) PromoterCenterSummary {
	total := model.LogUsageTotals{}
	active := make(map[int]bool)
	for _, row := range rows {
		total.Add(row)
		if row.LogType == model.LogTypeConsume && row.Calls > 0 {
			active[row.UserId] = true
		}
	}
	return PromoterCenterSummary{
		BoundUserCount: boundUserCount, ActiveUserCount: len(active),
		ConsumeQuota: total.ConsumeQuota, RefundQuota: total.RefundQuota, NetQuota: total.NetQuota, RequestCount: total.Calls,
		PromptTokens: total.PromptTokens, CompletionTokens: total.CompletionTokens, TotalTokens: total.TotalTokens(),
	}
}

func promoterDaily(rows []model.LogDailyUsageRow, r model.FinanceRange) []PromoterCenterDaily {
	byDay := model.FoldLogDailyUsage(rows, func(row model.LogDailyUsageRow) string { return row.Day })
	days := r.Days()
	daily := make([]PromoterCenterDaily, 0, len(days))
	for _, day := range days {
		item := PromoterCenterDaily{Day: day}
		if totals := byDay[day]; totals != nil {
			item.NetQuota, item.RequestCount, item.PromptTokens, item.CompletionTokens = totals.NetQuota, totals.Calls, totals.PromptTokens, totals.CompletionTokens
		}
		daily = append(daily, item)
	}
	return daily
}

func promoterModels(rows []model.LogDailyUsageRow) []PromoterCenterModel {
	byModel := model.FoldLogDailyUsage(rows, func(row model.LogDailyUsageRow) string { return row.ModelName })
	var totalNet int64
	for _, totals := range byModel {
		if totals.NetQuota > 0 {
			totalNet += totals.NetQuota
		}
	}
	items := make([]PromoterCenterModel, 0, len(byModel))
	for name, totals := range byModel {
		item := PromoterCenterModel{
			ModelName: name, NetQuota: totals.NetQuota, RequestCount: totals.Calls,
			PromptTokens: totals.PromptTokens, CompletionTokens: totals.CompletionTokens, TotalTokens: totals.TotalTokens(),
		}
		if totalNet > 0 && totals.NetQuota > 0 {
			item.Percentage = float64(int64(float64(totals.NetQuota)/float64(totalNet)*10000+0.5)) / 100
		}
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].NetQuota != items[j].NetQuota {
			return items[i].NetQuota > items[j].NetQuota
		}
		return items[i].ModelName < items[j].ModelName
	})
	if len(items) > PromoterCenterMaxModels {
		items = items[:PromoterCenterMaxModels]
	}
	return items
}

func promoterRange(r model.FinanceRange) PromoterCenterRange {
	return PromoterCenterRange{Start: r.Start, EndExcl: r.EndExcl, StartDay: model.FinanceDay(r.Start), EndDay: model.FinanceDay(r.EndExcl - 1)}
}

// GetPromoterProfile 推广人档案 + 用户信息
func GetPromoterProfile(promoter *model.Promoter) (PromoterProfile, error) {
	profile := PromoterProfile{Id: promoter.Id, UserId: promoter.UserId, Remark: promoter.Remark, ShareRate: promoter.ShareRate, CreatedAt: promoter.CreatedAt}
	user, err := model.GetUserById(promoter.UserId, false)
	if err != nil {
		return profile, err
	}
	profile.Username, profile.DisplayName, profile.AffCode = user.Username, user.DisplayName, user.AffCode
	return profile, nil
}

// GetPromoterCenterOverview 总览：汇总 + 按天
func GetPromoterCenterOverview(promoter *model.Promoter, r model.FinanceRange) (*PromoterCenterOverview, error) {
	profile, err := GetPromoterProfile(promoter)
	if err != nil {
		return nil, err
	}
	scope, err := loadPromoterScope(promoter.UserId)
	if err != nil {
		return nil, err
	}
	rows, err := scope.read(r)
	if err != nil {
		return nil, err
	}
	return &PromoterCenterOverview{
		Promoter: profile, Range: promoterRange(r),
		Summary: promoterSummary(rows, len(scope.userIds)), Daily: promoterDaily(rows, r),
	}, nil
}

// ListPromoterCenterUsers 名下用户（含 0 消耗），按净额倒序；withContact 为管理员视图，附邮箱 / 分组 / 操作人
func ListPromoterCenterUsers(promoter *model.Promoter, r model.FinanceRange, withContact bool) ([]PromoterCenterUser, error) {
	scope, err := loadPromoterScope(promoter.UserId)
	if err != nil {
		return nil, err
	}
	rows, err := scope.read(r)
	if err != nil {
		return nil, err
	}
	return buildPromoterCenterUsers(scope, rows, withContact)
}

func buildPromoterCenterUsers(scope promoterScope, rows []model.LogDailyUsageRow, withContact bool) ([]PromoterCenterUser, error) {
	briefs, err := model.GetPromoterUserBriefs(scope.userIds)
	if err != nil {
		return nil, err
	}
	enterprises, err := model.ListEnterpriseUserIds(scope.userIds)
	if err != nil {
		return nil, err
	}
	operatorNames := make(map[int]string)
	if withContact {
		operatorIds := make([]int, 0)
		for _, binding := range scope.bindings {
			if binding.BoundBy > 0 && operatorNames[binding.BoundBy] == "" {
				operatorNames[binding.BoundBy] = "-"
				operatorIds = append(operatorIds, binding.BoundBy)
			}
		}
		operators, err := model.GetPromoterUserBriefs(operatorIds)
		if err != nil {
			return nil, err
		}
		for id, brief := range operators {
			operatorNames[id] = brief.Username
		}
	}
	byUser := model.FoldLogDailyUsage(rows, func(row model.LogDailyUsageRow) int { return row.UserId })
	lastDay := make(map[int]string, len(scope.userIds))
	for _, row := range rows {
		if row.LogType == model.LogTypeConsume && row.Day > lastDay[row.UserId] {
			lastDay[row.UserId] = row.Day
		}
	}
	users := make([]PromoterCenterUser, 0, len(scope.bindings))
	for _, binding := range scope.bindings {
		item := PromoterCenterUser{
			UserId: binding.UserId, Source: binding.Source, BoundAt: binding.BoundAt, UsageSince: binding.UsageSince,
			IsEnterprise: enterprises[binding.UserId], LastConsumeDay: lastDay[binding.UserId],
		}
		if brief := briefs[binding.UserId]; brief != nil {
			item.Username, item.DisplayName, item.Deleted = brief.Username, brief.DisplayName, brief.Deleted
			if withContact {
				item.Email, item.Group = brief.Email, brief.Group
			}
		}
		if withContact {
			item.BoundByUsername = operatorNames[binding.BoundBy]
		}
		if totals := byUser[binding.UserId]; totals != nil {
			item.NetQuota, item.RequestCount, item.TotalTokens = totals.NetQuota, totals.Calls, totals.TotalTokens()
		}
		users = append(users, item)
	}
	sort.SliceStable(users, func(i, j int) bool {
		if users[i].NetQuota != users[j].NetQuota {
			return users[i].NetQuota > users[j].NetQuota
		}
		return users[i].BoundAt > users[j].BoundAt
	})
	return users, nil
}

// ListPromoterCenterModels 模型消费
func ListPromoterCenterModels(promoter *model.Promoter, r model.FinanceRange) (*PromoterCenterModels, error) {
	scope, err := loadPromoterScope(promoter.UserId)
	if err != nil {
		return nil, err
	}
	rows, err := scope.read(r)
	if err != nil {
		return nil, err
	}
	return &PromoterCenterModels{Summary: promoterSummary(rows, len(scope.userIds)), Items: promoterModels(rows)}, nil
}

// GetPromoterCenterUserUsage 名下单个用户的下钻；用户不在名下返回 ErrPromoterUserNotBound
func GetPromoterCenterUserUsage(promoter *model.Promoter, userId int, r model.FinanceRange) (*PromoterCenterUserUsage, error) {
	binding, err := model.GetActiveBindingByUserId(userId)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPromoterUserNotBound
		}
		return nil, err
	}
	if binding.PromoterUserId != promoter.UserId {
		return nil, ErrPromoterUserNotBound
	}
	scope := newPromoterScope([]*model.PromoterBinding{binding})
	rows, err := scope.read(r)
	if err != nil {
		return nil, err
	}
	users, err := buildPromoterCenterUsers(scope, rows, false)
	if err != nil {
		return nil, err
	}
	usage := &PromoterCenterUserUsage{Summary: promoterSummary(rows, 1), Daily: promoterDaily(rows, r), Models: promoterModels(rows)}
	if len(users) > 0 {
		usage.User = users[0]
	}
	return usage, nil
}

// CurrentMonthRange 本月 1 日 → 今天（上海时区），管理端列表「本月消耗」与缺省区间共用
func CurrentMonthRange(now time.Time) model.FinanceRange {
	loc := model.BillingLocation()
	now = now.In(loc)
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	end := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, 1)
	return model.FinanceRange{Start: start.Unix(), EndExcl: end.Unix()}
}

// PromoterNetQuotaByPromoter 若干推广人在区间内的净消耗（管理端列表一次取全，按推广人归并）
func PromoterNetQuotaByPromoter(promoterUserIds []int, r model.FinanceRange) (map[int]int64, error) {
	result := make(map[int]int64, len(promoterUserIds))
	bindings, err := model.ListActiveBindingsByPromoters(promoterUserIds)
	if err != nil {
		return nil, err
	}
	if len(bindings) == 0 {
		return result, nil
	}
	scope := newPromoterScope(bindings)
	promoterOf := make(map[int]int, len(bindings))
	for _, binding := range bindings {
		promoterOf[binding.UserId] = binding.PromoterUserId
	}
	rows, err := scope.read(r)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		switch row.LogType {
		case model.LogTypeConsume:
			result[promoterOf[row.UserId]] += row.Quota
		case model.LogTypeRefund:
			result[promoterOf[row.UserId]] -= row.Quota
		}
	}
	return result, nil
}
