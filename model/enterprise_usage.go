package model

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ContextKeyEnterpriseCreditPeriod gin 上下文里的预扣账期 id（授信企业），用量聚合按它归期
const ContextKeyEnterpriseCreditPeriod = "enterprise_credit_period_id"

// EnterpriseUsageDaily 企业用量日聚合：团队/持有人在写入时快照（并作为主键的一部分），历史不随组织调整漂移
type EnterpriseUsageDaily struct {
	Day          string `json:"day" gorm:"type:varchar(10);primaryKey;index:idx_ent_usage_enterprise_day,priority:2"`
	EnterpriseId int    `json:"enterprise_id" gorm:"primaryKey;autoIncrement:false;index:idx_ent_usage_enterprise_day,priority:1"`
	TokenId      int    `json:"token_id" gorm:"primaryKey;autoIncrement:false"`
	ModelName    string `json:"model_name" gorm:"type:varchar(128);primaryKey"`
	PeriodId     int64  `json:"period_id" gorm:"primaryKey;autoIncrement:false;index"`
	// 归属维度也是主键的一部分：归属变更后新用量落到新行，历史行不受影响
	TeamId              int   `json:"team_id" gorm:"primaryKey;autoIncrement:false"`
	MemberId            int   `json:"member_id" gorm:"primaryKey;autoIncrement:false"`
	RequestCount        int64 `json:"request_count" gorm:"not null;default:0"`
	PromptTokens        int64 `json:"prompt_tokens" gorm:"not null;default:0"`
	CompletionTokens    int64 `json:"completion_tokens" gorm:"not null;default:0"`
	CacheTokens         int64 `json:"cache_tokens" gorm:"not null;default:0"`
	CacheCreationTokens int64 `json:"cache_creation_tokens" gorm:"not null;default:0"`
	Quota               int64 `json:"quota" gorm:"not null;default:0"`
	UpdatedAt           int64 `json:"updated_at" gorm:"not null"`
}

func (EnterpriseUsageDaily) TableName() string { return "ent_usage_daily" }

// enterpriseUsageDay 按账期时区取日期（YYYY-MM-DD）
func enterpriseUsageDay(timestamp int64) string {
	return time.Unix(timestamp, 0).In(enterpriseBillingLocation).Format("2006-01-02")
}

// EnterpriseMonthStartDay 当前自然月的第一天（账期时区）
func EnterpriseMonthStartDay(now time.Time) string {
	local := now.In(enterpriseBillingLocation)
	return time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, enterpriseBillingLocation).Format("2006-01-02")
}

// ---------------------------------------------------------------------------
// key 归属缓存（token_id -> 团队/持有人），短 TTL，归属变更最多延迟一个 TTL
// ---------------------------------------------------------------------------

type tokenAttribution struct {
	TeamId   int
	MemberId int
}

type tokenAttributionEntry struct {
	value     tokenAttribution
	expiresAt time.Time
}

const tokenAttributionTTL = 30 * time.Second

var tokenAttributionCache sync.Map // token_id -> tokenAttributionEntry

func getTokenAttribution(tokenId int) (tokenAttribution, error) {
	if cached, ok := tokenAttributionCache.Load(tokenId); ok {
		entry := cached.(tokenAttributionEntry)
		if time.Now().Before(entry.expiresAt) {
			return entry.value, nil
		}
	}
	var value tokenAttribution
	err := DB.Table("ent_token_assignments a").
		Select("a.team_id, a.member_id").
		Where("a.token_id = ?", tokenId).
		Scan(&value).Error
	if err != nil {
		return value, err
	}
	tokenAttributionCache.Store(tokenId, tokenAttributionEntry{value: value, expiresAt: time.Now().Add(tokenAttributionTTL)})
	return value, nil
}

// IsEnterpriseEmployeeToken 该 key 是否分配给了具体成员；企业主自建的团队公共 key 返回 false
func IsEnterpriseEmployeeToken(tokenId int) (bool, error) {
	attribution, err := getTokenAttribution(tokenId)
	return attribution.MemberId != 0, err
}

// InvalidateTokenAttribution 归属变更后调用，让后续请求立刻按新归属统计
func InvalidateTokenAttribution(tokenId int) {
	tokenAttributionCache.Delete(tokenId)
}

// InvalidateAllTokenAttribution 成员换团队等影响多把 key 的变更后整体失效
func InvalidateAllTokenAttribution() {
	tokenAttributionCache.Range(func(key, _ any) bool {
		tokenAttributionCache.Delete(key)
		return true
	})
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

// EnterpriseUsageEvent 一次消费日志对应的聚合输入
type EnterpriseUsageEvent struct {
	UserId              int
	TokenId             int
	ModelName           string
	PromptTokens        int
	CompletionTokens    int
	CacheTokens         int
	CacheCreationTokens int
	Quota               int
	CreatedAt           int64
	CreditPeriodId      int64
}

// RecordEnterpriseUsage 同步写入日聚合（非企业用户直接返回）；消费日志路径用 RecordEnterpriseUsageAsync
func RecordEnterpriseUsage(event EnterpriseUsageEvent) error {
	info, err := GetEnterpriseBillingInfo(event.UserId)
	if err != nil || info == nil {
		return err
	}
	attribution, err := getTokenAttribution(event.TokenId)
	if err != nil {
		return err
	}
	modelName := event.ModelName
	if runes := []rune(modelName); len(runes) > 128 {
		modelName = string(runes[:128])
	}
	periodId := event.CreditPeriodId
	if info.BillingMode != EnterpriseBillingModeCredit {
		periodId = 0
	}
	row := EnterpriseUsageDaily{
		Day:                 enterpriseUsageDay(event.CreatedAt),
		EnterpriseId:        info.EnterpriseId,
		TokenId:             event.TokenId,
		ModelName:           modelName,
		PeriodId:            periodId,
		TeamId:              attribution.TeamId,
		MemberId:            attribution.MemberId,
		RequestCount:        1,
		PromptTokens:        int64(event.PromptTokens),
		CompletionTokens:    int64(event.CompletionTokens),
		CacheTokens:         int64(event.CacheTokens),
		CacheCreationTokens: int64(event.CacheCreationTokens),
		Quota:               int64(event.Quota),
		UpdatedAt:           common.GetTimestamp(),
	}
	err = DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "day"}, {Name: "enterprise_id"}, {Name: "token_id"}, {Name: "model_name"}, {Name: "period_id"},
			{Name: "team_id"}, {Name: "member_id"},
		},
		DoUpdates: clause.Assignments(map[string]any{
			"request_count":         gorm.Expr("ent_usage_daily.request_count + EXCLUDED.request_count"),
			"prompt_tokens":         gorm.Expr("ent_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens"),
			"completion_tokens":     gorm.Expr("ent_usage_daily.completion_tokens + EXCLUDED.completion_tokens"),
			"cache_tokens":          gorm.Expr("ent_usage_daily.cache_tokens + EXCLUDED.cache_tokens"),
			"cache_creation_tokens": gorm.Expr("ent_usage_daily.cache_creation_tokens + EXCLUDED.cache_creation_tokens"),
			"quota":                 gorm.Expr("ent_usage_daily.quota + EXCLUDED.quota"),
			"updated_at":            row.UpdatedAt,
		}),
	}).Create(&row).Error
	if err != nil {
		return err
	}
	// 团队预算：只对设了预算的团队判档；本节点写入的用量先累加进缓存再判
	budget, ok := info.TeamBudgets[attribution.TeamId]
	if !ok {
		return nil
	}
	addTeamMonthUsage(attribution.TeamId, row.Quota)
	used, err := GetTeamMonthUsage(info.EnterpriseId, attribution.TeamId)
	if err != nil {
		common.SysError(fmt.Sprintf("enterprise team budget: load month usage for team %d failed: %v", attribution.TeamId, err))
		return nil
	}
	checkTeamBudgetAfterUsage(info.EnterpriseId, attribution.TeamId, budget, used)
	return nil
}

// logOtherInt 从消费日志 other 的公开字段取整数（缺失或类型不符按 0）
func logOtherInt(other map[string]any, key string) int {
	switch v := other[key].(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case float32:
		return int(v)
	}
	return 0
}

// RecordEnterpriseUsageAsync 消费日志钩子：异步写入，失败重试 3 次后记错误日志
func RecordEnterpriseUsageAsync(c *gin.Context, userId int, params RecordConsumeLogParams) {
	if DB == nil || c == nil {
		return
	}
	// 只有企业用户才需要排队写聚合；缓存命中时这一步没有数据库开销
	info, err := GetEnterpriseBillingInfo(userId)
	if err != nil || info == nil {
		return
	}
	event := EnterpriseUsageEvent{
		UserId:           userId,
		TokenId:          params.TokenId,
		ModelName:        params.ModelName,
		PromptTokens:     params.PromptTokens,
		CompletionTokens: params.CompletionTokens,
		Quota:            params.Quota,
		CreatedAt:        common.GetTimestamp(),
	}
	if params.Other != nil {
		other := params.Other.Snapshot()
		event.CacheTokens = logOtherInt(other, "cache_tokens")
		event.CacheCreationTokens = logOtherInt(other, "cache_creation_tokens")
	}
	if periodId, ok := c.Get(ContextKeyEnterpriseCreditPeriod); ok {
		if id, isInt64 := periodId.(int64); isInt64 {
			event.CreditPeriodId = id
		}
	}
	gopool.Go(func() {
		var lastErr error
		for attempt := range 3 {
			if lastErr = RecordEnterpriseUsage(event); lastErr == nil {
				return
			}
			time.Sleep(time.Duration(200*(attempt+1)) * time.Millisecond)
		}
		common.SysError(fmt.Sprintf("failed to record enterprise usage (user=%d token=%d): %s", userId, params.TokenId, lastErr.Error()))
	})
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

// 用量汇总的分组维度
const (
	EnterpriseUsageGroupTeam   = "team"
	EnterpriseUsageGroupMember = "member"
	EnterpriseUsageGroupModel  = "model"
	EnterpriseUsageGroupToken  = "token"
	EnterpriseUsageGroupDay    = "day"
)

var ErrEnterpriseUsageGroup = errors.New("invalid usage group")

// EnterpriseUsageFilter 按归属过滤（下钻用）；scope 限定团队时由调用方合并进 TeamId
type EnterpriseUsageFilter struct {
	TeamId   *int
	MemberId *int
}

// WithScope 把范围并进过滤条件：范围限定团队时强制按该团队过滤
func (f EnterpriseUsageFilter) WithScope(scope EnterpriseScope) EnterpriseUsageFilter {
	if scope.TeamId != nil {
		f.TeamId = scope.TeamId
	}
	return f
}

// EnterpriseUsageSummaryItem 汇总行；KeyId 对维度为 model/day 时为 0，KeyName 为模型名/日期
type EnterpriseUsageSummaryItem struct {
	KeyId               int    `json:"key_id"`
	KeyName             string `json:"key_name"`
	RequestCount        int64  `json:"request_count"`
	PromptTokens        int64  `json:"prompt_tokens"`
	CompletionTokens    int64  `json:"completion_tokens"`
	CacheTokens         int64  `json:"cache_tokens"`
	CacheCreationTokens int64  `json:"cache_creation_tokens"`
	Quota               int64  `json:"quota"`
}

const enterpriseUsageSums = "SUM(u.request_count) AS request_count, SUM(u.prompt_tokens) AS prompt_tokens, SUM(u.completion_tokens) AS completion_tokens, " +
	"SUM(u.cache_tokens) AS cache_tokens, SUM(u.cache_creation_tokens) AS cache_creation_tokens, SUM(u.quota) AS quota"

// ValidateEnterpriseUsageDay 校验 YYYY-MM-DD
func ValidateEnterpriseUsageDay(day string) error {
	if _, err := time.ParseInLocation("2006-01-02", day, enterpriseBillingLocation); err != nil {
		return fmt.Errorf("invalid day %q, expected YYYY-MM-DD", day)
	}
	return nil
}

// DefaultEnterpriseUsageRange 默认最近 30 天（含今天）
func DefaultEnterpriseUsageRange() (string, string) {
	now := time.Now().In(enterpriseBillingLocation)
	return now.AddDate(0, 0, -29).Format("2006-01-02"), now.Format("2006-01-02")
}

func applyEnterpriseUsageFilter(query *gorm.DB, filter EnterpriseUsageFilter) *gorm.DB {
	if filter.TeamId != nil {
		query = query.Where("u.team_id = ?", *filter.TeamId)
	}
	if filter.MemberId != nil {
		query = query.Where("u.member_id = ?", *filter.MemberId)
	}
	return query
}

func SummarizeEnterpriseUsage(enterpriseId int, groupBy string, fromDay string, toDay string, filter EnterpriseUsageFilter) ([]*EnterpriseUsageSummaryItem, error) {
	base := applyEnterpriseUsageFilter(DB.Table("ent_usage_daily u").Where("u.enterprise_id = ? AND u.day BETWEEN ? AND ?", enterpriseId, fromDay, toDay), filter)
	switch groupBy {
	case EnterpriseUsageGroupTeam:
		base = base.Select("u.team_id AS key_id, COALESCE(MAX(tm.name), '') AS key_name, " + enterpriseUsageSums).
			Joins("LEFT JOIN ent_teams tm ON tm.id = u.team_id").Group("u.team_id")
	case EnterpriseUsageGroupMember:
		base = base.Select("u.member_id AS key_id, COALESCE(MAX(m.name), '') AS key_name, " + enterpriseUsageSums).
			Joins("LEFT JOIN ent_members m ON m.id = u.member_id").Group("u.member_id")
	case EnterpriseUsageGroupToken:
		base = base.Select("u.token_id AS key_id, COALESCE(MAX(t.name), '') AS key_name, " + enterpriseUsageSums).
			Joins("LEFT JOIN tokens t ON t.id = u.token_id").Group("u.token_id")
	case EnterpriseUsageGroupModel:
		base = base.Select("0 AS key_id, u.model_name AS key_name, " + enterpriseUsageSums).Group("u.model_name")
	case EnterpriseUsageGroupDay:
		base = base.Select("0 AS key_id, u.day AS key_name, " + enterpriseUsageSums).Group("u.day")
	default:
		return nil, ErrEnterpriseUsageGroup
	}
	order := "quota DESC"
	if groupBy == EnterpriseUsageGroupDay {
		order = "key_name ASC"
	}
	items := make([]*EnterpriseUsageSummaryItem, 0)
	err := base.Order(order).Limit(500).Scan(&items).Error
	return items, err
}

// SumEnterpriseUsageTotal 区间合计（环比与概览用）
func SumEnterpriseUsageTotal(enterpriseId int, fromDay string, toDay string, filter EnterpriseUsageFilter) (*EnterpriseUsageSummaryItem, error) {
	var total EnterpriseUsageSummaryItem
	err := applyEnterpriseUsageFilter(DB.Table("ent_usage_daily u").Where("u.enterprise_id = ? AND u.day BETWEEN ? AND ?", enterpriseId, fromDay, toDay), filter).
		Select("COALESCE(SUM(u.request_count), 0) AS request_count, COALESCE(SUM(u.prompt_tokens), 0) AS prompt_tokens, COALESCE(SUM(u.completion_tokens), 0) AS completion_tokens, " +
			"COALESCE(SUM(u.cache_tokens), 0) AS cache_tokens, COALESCE(SUM(u.cache_creation_tokens), 0) AS cache_creation_tokens, COALESCE(SUM(u.quota), 0) AS quota").
		Scan(&total).Error
	return &total, err
}

// SumEnterpriseUsageByColumn 按某个归属列对一组 id 求区间消耗（列表页回填本月消耗用）；column 只接受固定取值
func SumEnterpriseUsageByColumn(enterpriseId int, column string, ids []int, fromDay string, toDay string) (map[int]int64, error) {
	result := map[int]int64{}
	if len(ids) == 0 {
		return result, nil
	}
	switch column {
	case "team_id", "member_id", "token_id":
	default:
		return nil, fmt.Errorf("unsupported usage column: %s", column)
	}
	rows := make([]struct {
		KeyId int   `gorm:"column:key_id"`
		Quota int64 `gorm:"column:quota"`
	}, 0)
	err := DB.Table("ent_usage_daily u").
		Select("u."+column+" AS key_id, SUM(u.quota) AS quota").
		Where("u.enterprise_id = ? AND u.day BETWEEN ? AND ? AND u."+column+" IN ?", enterpriseId, fromDay, toDay, ids).
		Group("u." + column).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.KeyId] = row.Quota
	}
	return result, nil
}

// EnterpriseUsageDayItem 按天汇总（概览柱图用）；区间内没有用量的日期补零
type EnterpriseUsageDayItem struct {
	Day          string `json:"day"`
	Quota        int64  `json:"quota"`
	RequestCount int64  `json:"request_count"`
}

// SummarizeEnterpriseUsageByDay [fromDay, toDay] 内每一天的消耗，按日期升序、缺的日期补零
func SummarizeEnterpriseUsageByDay(enterpriseId int, fromDay string, toDay string, filter EnterpriseUsageFilter) ([]*EnterpriseUsageDayItem, error) {
	start, err := time.ParseInLocation("2006-01-02", fromDay, enterpriseBillingLocation)
	if err != nil {
		return nil, err
	}
	end, err := time.ParseInLocation("2006-01-02", toDay, enterpriseBillingLocation)
	if err != nil {
		return nil, err
	}
	items, err := SummarizeEnterpriseUsage(enterpriseId, EnterpriseUsageGroupDay, fromDay, toDay, filter)
	if err != nil {
		return nil, err
	}
	byDay := make(map[string]*EnterpriseUsageSummaryItem, len(items))
	for _, item := range items {
		byDay[item.KeyName] = item
	}
	days := make([]*EnterpriseUsageDayItem, 0, 31)
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		row := &EnterpriseUsageDayItem{Day: day.Format("2006-01-02")}
		if item, ok := byDay[row.Day]; ok {
			row.Quota = item.Quota
			row.RequestCount = item.RequestCount
		}
		days = append(days, row)
	}
	return days, nil
}

// EnterpriseUsageExportRow 导出明细（最细粒度：日 × key × 模型）
type EnterpriseUsageExportRow struct {
	Day                 string `json:"day"`
	TeamName            string `json:"team_name"`
	MemberName          string `json:"member_name"`
	TokenName           string `json:"token_name"`
	ModelName           string `json:"model_name"`
	RequestCount        int64  `json:"request_count"`
	PromptTokens        int64  `json:"prompt_tokens"`
	CompletionTokens    int64  `json:"completion_tokens"`
	CacheTokens         int64  `json:"cache_tokens"`
	CacheCreationTokens int64  `json:"cache_creation_tokens"`
	Quota               int64  `json:"quota"`
}

func ExportEnterpriseUsage(enterpriseId int, fromDay string, toDay string, filter EnterpriseUsageFilter) ([]*EnterpriseUsageExportRow, error) {
	rows := make([]*EnterpriseUsageExportRow, 0)
	err := applyEnterpriseUsageFilter(DB.Table("ent_usage_daily u"), filter).
		Select(`u.day, COALESCE(tm.name, '') AS team_name, COALESCE(m.name, '') AS member_name,
			COALESCE(t.name, '') AS token_name, u.model_name,
			SUM(u.request_count) AS request_count, SUM(u.prompt_tokens) AS prompt_tokens,
			SUM(u.completion_tokens) AS completion_tokens, SUM(u.cache_tokens) AS cache_tokens,
			SUM(u.cache_creation_tokens) AS cache_creation_tokens, SUM(u.quota) AS quota`).
		Joins("LEFT JOIN ent_teams tm ON tm.id = u.team_id").
		Joins("LEFT JOIN ent_members m ON m.id = u.member_id").
		Joins("LEFT JOIN tokens t ON t.id = u.token_id").
		Where("u.enterprise_id = ? AND u.day BETWEEN ? AND ?", enterpriseId, fromDay, toDay).
		Group("u.day, tm.name, m.name, t.name, u.model_name").
		Order("u.day ASC, quota DESC").
		Limit(50000).
		Scan(&rows).Error
	return rows, err
}

// SumEnterpriseUsageByPeriod 某账期的明细合计（出账时与账期计数器对账）
func SumEnterpriseUsageByPeriod(enterpriseId int, periodId int64) (int64, error) {
	var total int64
	err := DB.Model(&EnterpriseUsageDaily{}).Where("enterprise_id = ? AND period_id = ?", enterpriseId, periodId).
		Select("COALESCE(SUM(quota), 0)").Scan(&total).Error
	return total, err
}

// ---------------------------------------------------------------------------
// 员工凭自己的 API key 自查（GET /v1/enterprise/employee/me）
// ---------------------------------------------------------------------------

// EnterpriseTokenProfile 一把 key 在企业组织里的归属：团队 / 持有人按新三层契约命名，
// 持有人可空（团队公共 key）。
type EnterpriseTokenProfile struct {
	Token        *Token
	EnterpriseId int
	TeamId       int
	TeamName     string
	TeamStatus   string
	// HasMember 为 false 表示 key 无持有人（团队公共 key），此时 Member* 字段无意义
	HasMember        bool
	MemberName       string
	MemberEmployeeNo string
	MemberStatus     string
}

// GetEnterpriseTokenProfile 读取 key 的组织归属（团队必有、持有人可空）；
// 没有归属行（主账号在上游 /keys 页自建的 key）返回 ErrEnterpriseResourceNotFound。
func GetEnterpriseTokenProfile(tokenId int) (*EnterpriseTokenProfile, error) {
	token, err := GetTokenById(tokenId)
	if err != nil {
		return nil, err
	}
	var row struct {
		EnterpriseId     int
		TeamId           int
		MemberId         int
		TeamName         string
		TeamStatus       string
		MemberName       string
		MemberEmployeeNo string
		MemberStatus     string
	}
	result := DB.Table("ent_token_assignments a").
		Select(`a.enterprise_id, a.team_id, a.member_id, COALESCE(t.name, '') AS team_name, COALESCE(t.status, '') AS team_status,
			COALESCE(m.name, '') AS member_name, COALESCE(m.employee_no, '') AS member_employee_no, COALESCE(m.status, '') AS member_status`).
		Joins("LEFT JOIN ent_teams t ON t.id = a.team_id AND t.deleted_at IS NULL").
		Joins("LEFT JOIN ent_members m ON m.id = a.member_id AND m.deleted_at IS NULL").
		Where("a.token_id = ?", tokenId).
		Limit(1).
		Scan(&row)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &EnterpriseTokenProfile{
		Token:            token,
		EnterpriseId:     row.EnterpriseId,
		TeamId:           row.TeamId,
		TeamName:         row.TeamName,
		TeamStatus:       row.TeamStatus,
		HasMember:        row.MemberId != 0,
		MemberName:       row.MemberName,
		MemberEmployeeNo: row.MemberEmployeeNo,
		MemberStatus:     row.MemberStatus,
	}, nil
}

// EnterpriseUsageTotals 一段日期内某把 key 的合计
type EnterpriseUsageTotals struct {
	Quota        int64 `json:"quota"`
	RequestCount int64 `json:"requests"`
}

// CurrentEnterpriseUsageDays 按账期时区返回今天与本月第一天（YYYY-MM-DD）
func CurrentEnterpriseUsageDays() (today string, monthStart string) {
	now := time.Now().In(enterpriseBillingLocation)
	return now.Format("2006-01-02"), time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, enterpriseBillingLocation).Format("2006-01-02")
}

// SumTokenUsage 单把 key 在 [fromDay, toDay] 的合计：按 token_id 汇总，不区分账期 / 归属快照
func SumTokenUsage(tokenId int, fromDay string, toDay string) (*EnterpriseUsageTotals, error) {
	totals := &EnterpriseUsageTotals{}
	err := DB.Model(&EnterpriseUsageDaily{}).
		Select("COALESCE(SUM(quota), 0) AS quota, COALESCE(SUM(request_count), 0) AS request_count").
		Where("token_id = ? AND day BETWEEN ? AND ?", tokenId, fromDay, toDay).
		Scan(totals).Error
	return totals, err
}

// EnterpriseTokenModelUsage 单把 key 按模型的合计
type EnterpriseTokenModelUsage struct {
	Model        string `json:"model"`
	Quota        int64  `json:"quota"`
	RequestCount int64  `json:"requests"`
}

// TopTokenModels 单把 key 在 [fromDay, toDay] 消耗最多的前 limit 个模型
func TopTokenModels(tokenId int, fromDay string, toDay string, limit int) ([]*EnterpriseTokenModelUsage, error) {
	items := make([]*EnterpriseTokenModelUsage, 0)
	err := DB.Model(&EnterpriseUsageDaily{}).
		Select("model_name AS model, SUM(quota) AS quota, SUM(request_count) AS request_count").
		Where("token_id = ? AND day BETWEEN ? AND ?", tokenId, fromDay, toDay).
		Group("model_name").
		Order("quota DESC, model_name ASC").
		Limit(limit).
		Scan(&items).Error
	return items, err
}
