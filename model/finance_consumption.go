package model

import (
	"fmt"
	"slices"
	"sort"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
)

// 用户消耗与模型消费（净额 = 消费 − 退款，次数与 token 只算消费）。
// 两者都走 tf_log_daily_rollups + 实时补边（ReadLogUsageByUser / ReadLogUsageByModelChannel），拆分列与最后消耗时间也来自预聚合度量；
// 聚合完再按当前页 ID 到主库补用户 / 企业 / 授信 / 订阅 / 渠道名，不跨库 JOIN。

// FinanceUserConsumptionFilter 用户消耗筛选
type FinanceUserConsumptionFilter struct {
	Range   FinanceRange
	Keyword string
	UserId  int
}

// FinanceCreditPeriodView 授信企业当前账期（用户消耗列表的余额列）
type FinanceCreditPeriodView struct {
	PeriodNo   int    `json:"period_no"`
	LimitQuota int64  `json:"limit_quota"`
	UsedQuota  int64  `json:"used_quota"`
	StartAt    int64  `json:"start_at"`
	EndAt      int64  `json:"end_at"`
	Status     string `json:"status"`
}

// FinanceUserConsumptionItem 用户消耗一行
type FinanceUserConsumptionItem struct {
	UserId             int    `json:"user_id"`
	Username           string `json:"username"`
	Group              string `json:"group"`
	Status             int    `json:"status"`
	Role               int    `json:"role"`
	RemainQuota        int    `json:"remain_quota"`
	UsedQuota          int    `json:"used_quota"`
	TotalQuota         int    `json:"total_quota"`
	IsPaidUser         bool   `json:"is_paid_user"`
	HasSuccessfulOrder bool   `json:"has_successful_order"`

	ConsumeQuota     int64 `json:"consume_quota"`
	RefundQuota      int64 `json:"refund_quota"`
	NetQuota         int64 `json:"net_quota"`
	ConsumeCount     int64 `json:"consume_count"`
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
	LastConsumeAt    int64 `json:"last_consume_at"`

	TextInputTokens          int64 `json:"text_input_tokens"`
	TextOutputTokens         int64 `json:"text_output_tokens"`
	CacheReadTokens          int64 `json:"cache_read_tokens"`
	CacheWriteTokens         int64 `json:"cache_write_tokens"`
	AudioInputTokens         int64 `json:"audio_input_tokens"`
	AudioOutputTokens        int64 `json:"audio_output_tokens"`
	WalletConsumeQuota       int64 `json:"wallet_consume_quota"`
	SubscriptionConsumeQuota int64 `json:"subscription_consume_quota"`

	CurrentSubscriptionId          int    `json:"current_subscription_id"`
	CurrentSubscriptionCount       int    `json:"current_subscription_count"`
	CurrentSubscriptionPlanId      int    `json:"current_subscription_plan_id"`
	CurrentSubscriptionPlanTitle   string `json:"current_subscription_plan_title"`
	CurrentSubscriptionAmountUsed  int64  `json:"current_subscription_amount_used"`
	CurrentSubscriptionAmountTotal int64  `json:"current_subscription_amount_total"`
	CurrentSubscriptionSource      string `json:"current_subscription_source"`
	CurrentSubscriptionEndTime     int64  `json:"current_subscription_end_time"`

	IsEnterprise   bool                     `json:"is_enterprise"`
	EnterpriseId   int                      `json:"enterprise_id,omitempty"`
	EnterpriseName string                   `json:"enterprise_name,omitempty"`
	BillingMode    string                   `json:"billing_mode,omitempty"`
	CreditPeriod   *FinanceCreditPeriodView `json:"credit_period,omitempty"`
}

// FinanceUserConsumptionMaxUsers 单次按 user_id 聚合的上限；超出时按净消耗截断尾部并记日志
const FinanceUserConsumptionMaxUsers = 50000

// financeUserConsumeScan 排序 / 分页用的轻量行；明细从 byUser 的 totals 取
type financeUserConsumeScan struct {
	UserId      int
	NetQuota    int64
	TotalTokens int64
}

// ListFinanceUserConsumptions 用户消耗列表：读取器按用户聚合（预聚合 + 实时补边，不分页）→ 关键词过滤 → 内存分页 → 只给当前页补充信息。
// 关键词在 users 表上匹配（用户名 / 数字 ID），而不是日志里写入时的用户名。
func ListFinanceUserConsumptions(filter FinanceUserConsumptionFilter, startIdx int, num int) ([]*FinanceUserConsumptionItem, int64, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, 0, err
	}
	r := filter.Range
	var scopeIds []int
	if filter.UserId > 0 {
		scopeIds = []int{filter.UserId}
	}
	if filter.Keyword != "" {
		matched, err := financeUserIdsByKeyword(filter.Keyword)
		if err != nil {
			return nil, 0, err
		}
		if filter.UserId > 0 && !slices.Contains(matched, filter.UserId) {
			matched = []int{}
		} else if filter.UserId > 0 {
			matched = []int{filter.UserId}
		}
		scopeIds = matched
	}
	byUser, err := ReadLogUsageByUser(scopeIds, r)
	if err != nil {
		return nil, 0, err
	}
	scans := make([]financeUserConsumeScan, 0, len(byUser))
	for userId, totals := range byUser {
		scans = append(scans, financeUserConsumeScan{UserId: userId, NetQuota: totals.NetQuota, TotalTokens: totals.TotalTokens()})
	}
	sort.Slice(scans, func(i, j int) bool {
		if scans[i].NetQuota != scans[j].NetQuota {
			return scans[i].NetQuota > scans[j].NetQuota
		}
		if scans[i].TotalTokens != scans[j].TotalTokens {
			return scans[i].TotalTokens > scans[j].TotalTokens
		}
		return scans[i].UserId < scans[j].UserId
	})
	if len(scans) > FinanceUserConsumptionMaxUsers {
		common.SysLog(fmt.Sprintf("finance user consumptions truncated at %d users for range [%d, %d)", FinanceUserConsumptionMaxUsers, r.Start, r.EndExcl))
		scans = scans[:FinanceUserConsumptionMaxUsers]
	}
	total := int64(len(scans))
	if startIdx >= len(scans) {
		return []*FinanceUserConsumptionItem{}, total, nil
	}
	page := scans[startIdx:min(startIdx+num, len(scans))]
	items := make([]*FinanceUserConsumptionItem, 0, len(page))
	userIds := make([]int, 0, len(page))
	byUserItem := make(map[int]*FinanceUserConsumptionItem, len(page))
	for _, scan := range page {
		totals := byUser[scan.UserId]
		item := &FinanceUserConsumptionItem{
			UserId: scan.UserId, ConsumeQuota: totals.ConsumeQuota, RefundQuota: totals.RefundQuota, NetQuota: totals.NetQuota,
			ConsumeCount: totals.Calls, PromptTokens: totals.PromptTokens, CompletionTokens: totals.CompletionTokens, TotalTokens: totals.TotalTokens(),
			LastConsumeAt:   totals.LastConsumeAt,
			TextInputTokens: totals.TextInputTokens, TextOutputTokens: totals.TextOutputTokens, CacheReadTokens: totals.CacheReadTokens, CacheWriteTokens: totals.CacheWriteTokens,
			AudioInputTokens: totals.AudioInputTokens, AudioOutputTokens: totals.AudioOutputTokens,
			WalletConsumeQuota: totals.WalletQuota, SubscriptionConsumeQuota: totals.SubscriptionQuota,
		}
		items = append(items, item)
		userIds = append(userIds, scan.UserId)
		byUserItem[scan.UserId] = item
	}
	if err := fillFinanceUserProfiles(byUserItem, userIds, r.EndExcl); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// financeUserIdsByKeyword 关键词命中的用户 id（含软删用户，历史消耗仍归属）：用户名模糊匹配，纯数字同时匹配 id
func financeUserIdsByKeyword(keyword string) ([]int, error) {
	pattern := financeContainsPattern(keyword)
	query := DB.Unscoped().Model(&User{})
	if keywordId, err := strconv.Atoi(keyword); err == nil && keywordId > 0 {
		query = query.Where("(username ILIKE ? ESCAPE '!' OR id = ?)", pattern, keywordId)
	} else {
		query = query.Where("username ILIKE ? ESCAPE '!'", pattern)
	}
	ids := make([]int, 0)
	if err := query.Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

// fillFinanceUserProfiles 当前页用户的账号 / 企业 / 授信 / 订阅 / 付费判定（主库）
func fillFinanceUserProfiles(byUser map[int]*FinanceUserConsumptionItem, userIds []int, before int64) error {
	type userScan struct {
		Id        int
		Username  string
		Group     string
		Status    int
		Role      int
		Quota     int
		UsedQuota int
	}
	users := make([]userScan, 0, len(userIds))
	if err := DB.Unscoped().Model(&User{}).Select("id, username, "+commonGroupCol+", status, role, quota, used_quota").Where("id IN ?", userIds).Scan(&users).Error; err != nil {
		return err
	}
	for _, user := range users {
		item := byUser[user.Id]
		if user.Username != "" {
			item.Username = user.Username
		}
		item.Group = user.Group
		item.Status = user.Status
		item.Role = user.Role
		item.RemainQuota = user.Quota
		item.UsedQuota = user.UsedQuota
		item.TotalQuota = user.Quota + user.UsedQuota
	}

	enterprises := make([]Enterprise, 0)
	if err := DB.Where("user_id IN ?", userIds).Find(&enterprises).Error; err != nil {
		return err
	}
	creditEnterpriseIds := make([]int, 0)
	itemByEnterprise := make(map[int]*FinanceUserConsumptionItem)
	for _, enterprise := range enterprises {
		item := byUser[enterprise.UserId]
		item.IsEnterprise = true
		item.EnterpriseId = enterprise.Id
		item.EnterpriseName = enterprise.Name
		item.BillingMode = enterprise.BillingMode
		if enterprise.BillingMode == EnterpriseBillingModeCredit {
			creditEnterpriseIds = append(creditEnterpriseIds, enterprise.Id)
			itemByEnterprise[enterprise.Id] = item
		}
	}
	if len(creditEnterpriseIds) > 0 {
		periods := make([]EnterpriseCreditPeriod, 0)
		if err := DB.Where("enterprise_id IN ? AND status = ?", creditEnterpriseIds, EnterpriseCreditPeriodOpen).Find(&periods).Error; err != nil {
			return err
		}
		for _, period := range periods {
			itemByEnterprise[period.EnterpriseId].CreditPeriod = &FinanceCreditPeriodView{
				PeriodNo: period.PeriodNo, LimitQuota: period.LimitQuota, UsedQuota: period.UsedQuota, StartAt: period.StartAt, EndAt: period.EndAt, Status: period.Status,
			}
		}
	}

	subscriptions := make([]UserSubscription, 0)
	err := DB.Where("user_id IN ? AND status = ? AND end_time > ?", userIds, "active", common.GetTimestamp()).
		Order("end_time DESC, id DESC").Find(&subscriptions).Error
	if err != nil {
		return err
	}
	for _, subscription := range subscriptions {
		item := byUser[subscription.UserId]
		item.CurrentSubscriptionCount++
		if item.CurrentSubscriptionId != 0 {
			continue
		}
		item.CurrentSubscriptionId = subscription.Id
		item.CurrentSubscriptionPlanId = subscription.PlanId
		item.CurrentSubscriptionAmountUsed = subscription.AmountUsed
		item.CurrentSubscriptionAmountTotal = subscription.AmountTotal
		item.CurrentSubscriptionSource = subscription.Source
		item.CurrentSubscriptionEndTime = subscription.EndTime
		if plan, err := GetSubscriptionPlanById(subscription.PlanId); err == nil && plan != nil {
			item.CurrentSubscriptionPlanTitle = plan.Title
		}
	}

	firstPaid, err := FinanceFirstPaidTimes(before)
	if err != nil {
		return err
	}
	for _, item := range byUser {
		_, item.HasSuccessfulOrder = firstPaid[item.UserId]
		item.IsPaidUser = item.Role < common.RoleAdminUser && (item.IsEnterprise || item.HasSuccessfulOrder)
	}
	return nil
}

// ---------------------------------------------------------------------------
// 模型消费
// ---------------------------------------------------------------------------

// FinanceModelConsumptionFilter 模型消费筛选
type FinanceModelConsumptionFilter struct {
	Range     FinanceRange
	ModelName string
	Username  string
	Group     string
}

// FinanceModelConsumptionItem 分组 × 模型 × 渠道 一行
type FinanceModelConsumptionItem struct {
	ModelName        string `json:"model_name"`
	Group            string `json:"group"`
	GroupLabel       string `json:"group_label"`
	ChannelId        int    `json:"channel_id"`
	ChannelName      string `json:"channel_name"`
	ConsumeQuota     int64  `json:"consume_quota"`
	RefundQuota      int64  `json:"refund_quota"`
	NetQuota         int64  `json:"net_quota"`
	ConsumeCount     int64  `json:"consume_count"`
	PromptTokens     int64  `json:"prompt_tokens"`
	CompletionTokens int64  `json:"completion_tokens"`
	TotalTokens      int64  `json:"total_tokens"`
}

// FinanceModelConsumptionSummary 模型消费汇总
type FinanceModelConsumptionSummary struct {
	NetQuota     int64 `json:"net_quota"`
	ConsumeQuota int64 `json:"consume_quota"`
	RefundQuota  int64 `json:"refund_quota"`
	ConsumeCount int64 `json:"consume_count"`
	TotalTokens  int64 `json:"total_tokens"`
	RowCount     int   `json:"row_count"`
	Truncated    bool  `json:"truncated"`
}

// FinanceModelConsumptionMaxRows 模型消费行数上限
const FinanceModelConsumptionMaxRows = 2000

// ListFinanceModelConsumptions 按 分组 × 模型 × 渠道 聚合净消费，一次返回全部（前端构树）。
// Username 在 users 表上匹配（用户名模糊 / 数字 id），与用户消耗的关键词口径一致，而不是日志写入时的用户名。
func ListFinanceModelConsumptions(filter FinanceModelConsumptionFilter) ([]*FinanceModelConsumptionItem, *FinanceModelConsumptionSummary, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, nil, err
	}
	var scopeIds []int
	if filter.Username != "" {
		matched, err := financeUserIdsByKeyword(filter.Username)
		if err != nil {
			return nil, nil, err
		}
		scopeIds = matched
	}
	byKey, err := ReadLogUsageByModelChannel(scopeIds, filter.ModelName, filter.Group, filter.Range)
	if err != nil {
		return nil, nil, err
	}
	scans := make([]*FinanceModelConsumptionItem, 0, len(byKey))
	for key, totals := range byKey {
		scans = append(scans, &FinanceModelConsumptionItem{
			ModelName: key.ModelName, Group: key.GroupName, ChannelId: key.ChannelId,
			ConsumeQuota: totals.ConsumeQuota, RefundQuota: totals.RefundQuota, NetQuota: totals.NetQuota, ConsumeCount: totals.Calls,
			PromptTokens: totals.PromptTokens, CompletionTokens: totals.CompletionTokens, TotalTokens: totals.TotalTokens(),
		})
	}
	sort.Slice(scans, func(i, j int) bool {
		if scans[i].NetQuota != scans[j].NetQuota {
			return scans[i].NetQuota > scans[j].NetQuota
		}
		if scans[i].TotalTokens != scans[j].TotalTokens {
			return scans[i].TotalTokens > scans[j].TotalTokens
		}
		if scans[i].ModelName != scans[j].ModelName {
			return scans[i].ModelName < scans[j].ModelName
		}
		if scans[i].Group != scans[j].Group {
			return scans[i].Group < scans[j].Group
		}
		return scans[i].ChannelId < scans[j].ChannelId
	})
	summary := &FinanceModelConsumptionSummary{}
	if len(scans) > FinanceModelConsumptionMaxRows {
		summary.Truncated = true
		scans = scans[:FinanceModelConsumptionMaxRows]
	}
	items := make([]*FinanceModelConsumptionItem, 0, len(scans))
	channelIds := make([]int, 0)
	seenChannel := make(map[int]bool)
	for _, item := range scans {
		item.GroupLabel = setting.GetUsableGroupDescription(item.Group)
		items = append(items, item)
		summary.NetQuota += item.NetQuota
		summary.ConsumeQuota += item.ConsumeQuota
		summary.RefundQuota += item.RefundQuota
		summary.ConsumeCount += item.ConsumeCount
		summary.TotalTokens += item.TotalTokens
		if item.ChannelId > 0 && !seenChannel[item.ChannelId] {
			seenChannel[item.ChannelId] = true
			channelIds = append(channelIds, item.ChannelId)
		}
	}
	summary.RowCount = len(items)
	if len(channelIds) > 0 {
		type channelRow struct {
			Id   int
			Name string
		}
		channels := make([]channelRow, 0, len(channelIds))
		if err := DB.Table("channels").Select("id, name").Where("id IN ?", channelIds).Scan(&channels).Error; err != nil {
			return nil, nil, err
		}
		names := make(map[int]string, len(channels))
		for _, channel := range channels {
			names[channel.Id] = channel.Name
		}
		for _, item := range items {
			if name, ok := names[item.ChannelId]; ok {
				item.ChannelName = name
			}
		}
	}
	return items, summary, nil
}
