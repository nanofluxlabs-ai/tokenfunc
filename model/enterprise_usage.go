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

// EnterpriseUsageDaily 企业用量日聚合：员工/部门/项目在写入时快照（并作为主键的一部分），历史不随组织调整漂移
type EnterpriseUsageDaily struct {
	Day          string `json:"day" gorm:"type:varchar(10);primaryKey;index:idx_ent_usage_enterprise_day,priority:2"`
	EnterpriseId int    `json:"enterprise_id" gorm:"primaryKey;autoIncrement:false;index:idx_ent_usage_enterprise_day,priority:1"`
	TokenId      int    `json:"token_id" gorm:"primaryKey;autoIncrement:false"`
	ModelName    string `json:"model_name" gorm:"type:varchar(128);primaryKey"`
	PeriodId     int64  `json:"period_id" gorm:"primaryKey;autoIncrement:false;index"`
	// 归属维度也是主键的一部分：归属变更后新用量落到新行，历史行不受影响
	EmployeeId       int   `json:"employee_id" gorm:"primaryKey;autoIncrement:false"`
	DepartmentId     int   `json:"department_id" gorm:"primaryKey;autoIncrement:false"`
	ProjectId        int   `json:"project_id" gorm:"primaryKey;autoIncrement:false"`
	RequestCount     int64 `json:"request_count" gorm:"not null;default:0"`
	PromptTokens     int64 `json:"prompt_tokens" gorm:"not null;default:0"`
	CompletionTokens int64 `json:"completion_tokens" gorm:"not null;default:0"`
	Quota            int64 `json:"quota" gorm:"not null;default:0"`
	UpdatedAt        int64 `json:"updated_at" gorm:"not null"`
}

func (EnterpriseUsageDaily) TableName() string { return "ent_usage_daily" }

// enterpriseUsageDay 按账期时区取日期（YYYY-MM-DD）
func enterpriseUsageDay(timestamp int64) string {
	return time.Unix(timestamp, 0).In(enterpriseBillingLocation).Format("2006-01-02")
}

// ---------------------------------------------------------------------------
// key 归属缓存（token_id -> 员工/部门/项目），短 TTL，归属变更最多延迟一个 TTL
// ---------------------------------------------------------------------------

type tokenAttribution struct {
	EmployeeId   int
	DepartmentId int
	ProjectId    int
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
		Select("a.employee_id, COALESCE(e.department_id, 0) AS department_id, a.project_id").
		Joins("LEFT JOIN ent_employees e ON e.id = a.employee_id").
		Where("a.token_id = ?", tokenId).
		Scan(&value).Error
	if err != nil {
		return value, err
	}
	tokenAttributionCache.Store(tokenId, tokenAttributionEntry{value: value, expiresAt: time.Now().Add(tokenAttributionTTL)})
	return value, nil
}

// InvalidateTokenAttribution 归属或员工部门变更后调用，让后续请求立刻按新归属统计
func InvalidateTokenAttribution(tokenId int) {
	tokenAttributionCache.Delete(tokenId)
}

// InvalidateAllTokenAttribution 员工换部门等影响多把 key 的变更后整体失效
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
	UserId           int
	TokenId          int
	ModelName        string
	PromptTokens     int
	CompletionTokens int
	Quota            int
	CreatedAt        int64
	CreditPeriodId   int64
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
		Day:              enterpriseUsageDay(event.CreatedAt),
		EnterpriseId:     info.EnterpriseId,
		TokenId:          event.TokenId,
		ModelName:        modelName,
		PeriodId:         periodId,
		EmployeeId:       attribution.EmployeeId,
		DepartmentId:     attribution.DepartmentId,
		ProjectId:        attribution.ProjectId,
		RequestCount:     1,
		PromptTokens:     int64(event.PromptTokens),
		CompletionTokens: int64(event.CompletionTokens),
		Quota:            int64(event.Quota),
		UpdatedAt:        common.GetTimestamp(),
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "day"}, {Name: "enterprise_id"}, {Name: "token_id"}, {Name: "model_name"}, {Name: "period_id"},
			{Name: "employee_id"}, {Name: "department_id"}, {Name: "project_id"},
		},
		DoUpdates: clause.Assignments(map[string]any{
			"request_count":     gorm.Expr("ent_usage_daily.request_count + EXCLUDED.request_count"),
			"prompt_tokens":     gorm.Expr("ent_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens"),
			"completion_tokens": gorm.Expr("ent_usage_daily.completion_tokens + EXCLUDED.completion_tokens"),
			"quota":             gorm.Expr("ent_usage_daily.quota + EXCLUDED.quota"),
			"updated_at":        row.UpdatedAt,
		}),
	}).Create(&row).Error
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
	EnterpriseUsageGroupDepartment = "department"
	EnterpriseUsageGroupEmployee   = "employee"
	EnterpriseUsageGroupProject    = "project"
	EnterpriseUsageGroupModel      = "model"
	EnterpriseUsageGroupToken      = "token"
	EnterpriseUsageGroupDay        = "day"
)

var ErrEnterpriseUsageGroup = errors.New("invalid usage group")

// EnterpriseUsageSummaryItem 汇总行；KeyId 对维度为 model/day 时为 0，KeyName 为模型名/日期
type EnterpriseUsageSummaryItem struct {
	KeyId            int    `json:"key_id"`
	KeyName          string `json:"key_name"`
	RequestCount     int64  `json:"request_count"`
	PromptTokens     int64  `json:"prompt_tokens"`
	CompletionTokens int64  `json:"completion_tokens"`
	Quota            int64  `json:"quota"`
}

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

func SummarizeEnterpriseUsage(enterpriseId int, groupBy string, fromDay string, toDay string) ([]*EnterpriseUsageSummaryItem, error) {
	base := DB.Table("ent_usage_daily u").Where("u.enterprise_id = ? AND u.day BETWEEN ? AND ?", enterpriseId, fromDay, toDay)
	sums := "SUM(u.request_count) AS request_count, SUM(u.prompt_tokens) AS prompt_tokens, SUM(u.completion_tokens) AS completion_tokens, SUM(u.quota) AS quota"
	switch groupBy {
	case EnterpriseUsageGroupDepartment:
		base = base.Select("u.department_id AS key_id, COALESCE(MAX(d.name), '') AS key_name, " + sums).
			Joins("LEFT JOIN ent_departments d ON d.id = u.department_id").Group("u.department_id")
	case EnterpriseUsageGroupEmployee:
		base = base.Select("u.employee_id AS key_id, COALESCE(MAX(e.name), '') AS key_name, " + sums).
			Joins("LEFT JOIN ent_employees e ON e.id = u.employee_id").Group("u.employee_id")
	case EnterpriseUsageGroupProject:
		base = base.Select("u.project_id AS key_id, COALESCE(MAX(p.name), '') AS key_name, " + sums).
			Joins("LEFT JOIN ent_projects p ON p.id = u.project_id").Group("u.project_id")
	case EnterpriseUsageGroupToken:
		base = base.Select("u.token_id AS key_id, COALESCE(MAX(t.name), '') AS key_name, " + sums).
			Joins("LEFT JOIN tokens t ON t.id = u.token_id").Group("u.token_id")
	case EnterpriseUsageGroupModel:
		base = base.Select("0 AS key_id, u.model_name AS key_name, " + sums).Group("u.model_name")
	case EnterpriseUsageGroupDay:
		base = base.Select("0 AS key_id, u.day AS key_name, " + sums).Group("u.day")
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

// EnterpriseUsageExportRow 导出明细（最细粒度：日 × key × 模型）
type EnterpriseUsageExportRow struct {
	Day              string `json:"day"`
	DepartmentName   string `json:"department_name"`
	EmployeeName     string `json:"employee_name"`
	ProjectName      string `json:"project_name"`
	TokenName        string `json:"token_name"`
	ModelName        string `json:"model_name"`
	RequestCount     int64  `json:"request_count"`
	PromptTokens     int64  `json:"prompt_tokens"`
	CompletionTokens int64  `json:"completion_tokens"`
	Quota            int64  `json:"quota"`
}

func ExportEnterpriseUsage(enterpriseId int, fromDay string, toDay string) ([]*EnterpriseUsageExportRow, error) {
	rows := make([]*EnterpriseUsageExportRow, 0)
	err := DB.Table("ent_usage_daily u").
		Select(`u.day, COALESCE(d.name, '') AS department_name, COALESCE(e.name, '') AS employee_name,
			COALESCE(p.name, '') AS project_name, COALESCE(t.name, '') AS token_name, u.model_name,
			SUM(u.request_count) AS request_count, SUM(u.prompt_tokens) AS prompt_tokens,
			SUM(u.completion_tokens) AS completion_tokens, SUM(u.quota) AS quota`).
		Joins("LEFT JOIN ent_departments d ON d.id = u.department_id").
		Joins("LEFT JOIN ent_employees e ON e.id = u.employee_id").
		Joins("LEFT JOIN ent_projects p ON p.id = u.project_id").
		Joins("LEFT JOIN tokens t ON t.id = u.token_id").
		Where("u.enterprise_id = ? AND u.day BETWEEN ? AND ?", enterpriseId, fromDay, toDay).
		Group("u.day, d.name, e.name, p.name, t.name, u.model_name").
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
