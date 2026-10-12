package model

import (
	"fmt"
	"sort"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
)

// 用户消耗与模型消费：都在 logs 上按区间聚合（净额 = 消费 − 退款，次数与 token 只算消费）。
// logs 可能在独立日志库，所以先在 LOG_DB 聚合，再按当前页 ID 到主库补用户 / 企业 / 授信 / 订阅信息，不跨库 JOIN。

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

type financeUserConsumeScan struct {
	UserId           int
	Username         string
	ConsumeQuota     int64
	RefundQuota      int64
	NetQuota         int64
	ConsumeCount     int64
	PromptTokens     int64
	CompletionTokens int64
	TotalTokens      int64
	LastConsumeAt    int64
}

type financeUserBreakdownScan struct {
	UserId                   int
	TextInputTokens          int64
	TextOutputTokens         int64
	CacheReadTokens          int64
	CacheWriteTokens         int64
	AudioInputTokens         int64
	AudioOutputTokens        int64
	WalletConsumeQuota       int64
	SubscriptionConsumeQuota int64
}

// ListFinanceUserConsumptions 用户消耗列表：logs 按用户聚合（不分页）→ 内存分页 → 只给当前页补充信息
func ListFinanceUserConsumptions(filter FinanceUserConsumptionFilter, startIdx int, num int) ([]*FinanceUserConsumptionItem, int64, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, 0, err
	}
	r := filter.Range
	query := LOG_DB.Table("logs").
		Select(fmt.Sprintf(`user_id, MAX(username) AS username,
	SUM(CASE WHEN type = %[1]d THEN quota ELSE 0 END)::bigint AS consume_quota,
	SUM(CASE WHEN type = %[2]d THEN quota ELSE 0 END)::bigint AS refund_quota,
	SUM(CASE WHEN type = %[1]d THEN quota WHEN type = %[2]d THEN -quota ELSE 0 END)::bigint AS net_quota,
	SUM(CASE WHEN type = %[1]d THEN 1 ELSE 0 END)::bigint AS consume_count,
	SUM(CASE WHEN type = %[1]d THEN prompt_tokens ELSE 0 END)::bigint AS prompt_tokens,
	SUM(CASE WHEN type = %[1]d THEN completion_tokens ELSE 0 END)::bigint AS completion_tokens,
	SUM(CASE WHEN type = %[1]d THEN prompt_tokens + completion_tokens ELSE 0 END)::bigint AS total_tokens,
	MAX(CASE WHEN type = %[1]d THEN created_at ELSE 0 END) AS last_consume_at`, LogTypeConsume, LogTypeRefund)).
		Where("user_id > 0 AND type IN ? AND created_at >= ? AND created_at < ?", []int{LogTypeConsume, LogTypeRefund}, r.Start, r.EndExcl)
	if filter.UserId > 0 {
		query = query.Where("user_id = ?", filter.UserId)
	}
	if filter.Keyword != "" {
		pattern := financeContainsPattern(filter.Keyword)
		if keywordId, err := strconv.Atoi(filter.Keyword); err == nil && keywordId > 0 {
			query = query.Where("(username ILIKE ? ESCAPE '!' OR user_id = ?)", pattern, keywordId)
		} else {
			query = query.Where("username ILIKE ? ESCAPE '!'", pattern)
		}
	}
	scans := make([]financeUserConsumeScan, 0)
	if err := query.Group("user_id").Order("net_quota DESC, total_tokens DESC, user_id ASC").Limit(FinanceUserConsumptionMaxUsers + 1).Scan(&scans).Error; err != nil {
		return nil, 0, err
	}
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
	byUser := make(map[int]*FinanceUserConsumptionItem, len(page))
	for _, scan := range page {
		item := &FinanceUserConsumptionItem{
			UserId: scan.UserId, Username: scan.Username, ConsumeQuota: scan.ConsumeQuota, RefundQuota: scan.RefundQuota, NetQuota: scan.NetQuota,
			ConsumeCount: scan.ConsumeCount, PromptTokens: scan.PromptTokens, CompletionTokens: scan.CompletionTokens, TotalTokens: scan.TotalTokens, LastConsumeAt: scan.LastConsumeAt,
		}
		items = append(items, item)
		userIds = append(userIds, scan.UserId)
		byUser[scan.UserId] = item
	}
	if err := fillFinanceUserBreakdown(byUser, userIds, r); err != nil {
		return nil, 0, err
	}
	if err := fillFinanceUserProfiles(byUser, userIds, r.EndExcl); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// fillFinanceUserBreakdown 当前页用户的 token 拆分与钱包 / 订阅拆分（LOG_DB，SQL 聚合）
//   - 文本输入优先 other.text_input；缺省按语义退化：Claude 语义 prompt 已是净输入，只扣音频；OpenAI 语义再扣缓存
//   - 订阅扣费：billing_source=subscription 时取 subscription_consumed（为 0 时整笔计入）；钱包：其余整笔，订阅请求取 wallet_quota_deducted
func fillFinanceUserBreakdown(byUser map[int]*FinanceUserConsumptionItem, userIds []int, r FinanceRange) error {
	query := fmt.Sprintf(`SELECT l.user_id,
	SUM(COALESCE(d.text_in, CASE WHEN d.is_net THEN GREATEST(l.prompt_tokens::bigint - d.audio_in, 0) ELSE GREATEST(l.prompt_tokens::bigint - d.audio_in - d.cache_read - d.cache_write, 0) END))::bigint AS text_input_tokens,
	SUM(COALESCE(d.text_out, GREATEST(l.completion_tokens::bigint - d.audio_out, 0)))::bigint AS text_output_tokens,
	SUM(d.cache_read)::bigint AS cache_read_tokens, SUM(d.cache_write)::bigint AS cache_write_tokens,
	SUM(d.audio_in)::bigint AS audio_input_tokens, SUM(d.audio_out)::bigint AS audio_output_tokens,
	SUM(CASE WHEN d.billing_source = 'subscription' THEN COALESCE(NULLIF(d.sub_consumed, 0), l.quota::bigint) ELSE 0 END)::bigint AS subscription_consume_quota,
	SUM(CASE WHEN d.billing_source = 'subscription' THEN COALESCE(d.wallet_deducted, 0) ELSE l.quota::bigint END)::bigint AS wallet_consume_quota
	%s WHERE l.user_id IN ? AND l.type = %d AND l.created_at >= %d AND l.created_at < %d GROUP BY l.user_id`, financeLogFromSQL, LogTypeConsume, r.Start, r.EndExcl)
	scans := make([]financeUserBreakdownScan, 0)
	if err := LOG_DB.Raw(query, userIds).Scan(&scans).Error; err != nil {
		return err
	}
	for _, scan := range scans {
		item := byUser[scan.UserId]
		if item == nil {
			continue
		}
		item.TextInputTokens = scan.TextInputTokens
		item.TextOutputTokens = scan.TextOutputTokens
		item.CacheReadTokens = scan.CacheReadTokens
		item.CacheWriteTokens = scan.CacheWriteTokens
		item.AudioInputTokens = scan.AudioInputTokens
		item.AudioOutputTokens = scan.AudioOutputTokens
		item.WalletConsumeQuota = scan.WalletConsumeQuota
		item.SubscriptionConsumeQuota = scan.SubscriptionConsumeQuota
	}
	return nil
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

// ListFinanceModelConsumptions 按 分组 × 模型 × 渠道 聚合净消费，一次返回全部（前端构树）
func ListFinanceModelConsumptions(filter FinanceModelConsumptionFilter) ([]*FinanceModelConsumptionItem, *FinanceModelConsumptionSummary, error) {
	if err := financeRequirePostgres(); err != nil {
		return nil, nil, err
	}
	r := filter.Range
	query := LOG_DB.Table("logs").
		Select(fmt.Sprintf(`model_name, %[3]s AS group_name, channel_id,
	SUM(CASE WHEN type = %[1]d THEN quota ELSE 0 END)::bigint AS consume_quota,
	SUM(CASE WHEN type = %[2]d THEN quota ELSE 0 END)::bigint AS refund_quota,
	SUM(CASE WHEN type = %[1]d THEN quota WHEN type = %[2]d THEN -quota ELSE 0 END)::bigint AS net_quota,
	SUM(CASE WHEN type = %[1]d THEN 1 ELSE 0 END)::bigint AS consume_count,
	SUM(CASE WHEN type = %[1]d THEN prompt_tokens ELSE 0 END)::bigint AS prompt_tokens,
	SUM(CASE WHEN type = %[1]d THEN completion_tokens ELSE 0 END)::bigint AS completion_tokens,
	SUM(CASE WHEN type = %[1]d THEN prompt_tokens + completion_tokens ELSE 0 END)::bigint AS total_tokens`, LogTypeConsume, LogTypeRefund, logGroupCol)).
		Where("user_id > 0 AND type IN ? AND created_at >= ? AND created_at < ?", []int{LogTypeConsume, LogTypeRefund}, r.Start, r.EndExcl)
	if filter.ModelName != "" {
		query = query.Where("model_name ILIKE ? ESCAPE '!'", financeContainsPattern(filter.ModelName))
	}
	if filter.Username != "" {
		query = query.Where("username ILIKE ? ESCAPE '!'", financeContainsPattern(filter.Username))
	}
	if filter.Group != "" {
		query = query.Where(logGroupCol+" = ?", filter.Group)
	}
	type scanRow struct {
		FinanceModelConsumptionItem
		GroupName string
	}
	scans := make([]scanRow, 0)
	err := query.Group("model_name, " + logGroupCol + ", channel_id").Order("net_quota DESC, total_tokens DESC, model_name ASC").
		Limit(FinanceModelConsumptionMaxRows + 1).Scan(&scans).Error
	if err != nil {
		return nil, nil, err
	}
	summary := &FinanceModelConsumptionSummary{}
	if len(scans) > FinanceModelConsumptionMaxRows {
		summary.Truncated = true
		scans = scans[:FinanceModelConsumptionMaxRows]
	}
	items := make([]*FinanceModelConsumptionItem, 0, len(scans))
	channelIds := make([]int, 0)
	seenChannel := make(map[int]bool)
	for _, scan := range scans {
		item := scan.FinanceModelConsumptionItem
		item.Group = scan.GroupName
		item.GroupLabel = setting.GetUsableGroupDescription(scan.GroupName)
		items = append(items, &item)
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
	sort.SliceStable(items, func(i, j int) bool { return items[i].NetQuota > items[j].NetQuota })
	return items, summary, nil
}
