package model

import (
	"fmt"
	"sort"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ChannelDailyDimUsage 按 渠道 × 自然日（计费时区） × 用户 × 模型 预聚合的用量，服务「渠道消耗」页的展开明细
// （用户 Top / 模型 Top）。与 ChannelHourlyUsage 完全同源：同一记账点、同一次 flush 落库，
// 因此同一区间内本表按渠道求和 = 渠道行的区间价值（热路径覆盖期内）。
// 上线前的历史日由 service.BackfillChannelDimUsageDay 从 logs 按天删后重建。
//
// 主键顺序 (channel_id, day_start, user_id, model_name) 直接服务「若干渠道 + 日期区间」的前缀扫描；
// idx_cddu_day 服务回填按天删除与覆盖起点 MIN(day_start)。
type ChannelDailyDimUsage struct {
	ChannelId        int    `json:"channel_id" gorm:"primaryKey;autoIncrement:false"`
	DayStart         int64  `json:"day_start" gorm:"primaryKey;autoIncrement:false;index:idx_cddu_day"`
	UserId           int    `json:"user_id" gorm:"primaryKey;autoIncrement:false"`
	ModelName        string `json:"model_name" gorm:"primaryKey;type:varchar(191)"`
	Quota            int64  `json:"quota" gorm:"not null;default:0"`
	OfficialQuota    int64  `json:"official_quota" gorm:"not null;default:0"`
	PromptTokens     int64  `json:"prompt_tokens" gorm:"not null;default:0"`
	CompletionTokens int64  `json:"completion_tokens" gorm:"not null;default:0"`
	CallCount        int64  `json:"call_count" gorm:"not null;default:0"`
}

func (ChannelDailyDimUsage) TableName() string { return "channel_daily_dim_usages" }

const (
	// channelDimModelNameMaxLen 与列宽 varchar(191) 对齐，按字符截断
	channelDimModelNameMaxLen = 191
	// channelDimUpsertBatch 多行 upsert 单批行数
	channelDimUpsertBatch = 200
	// channelDimAggRowLimit 读侧单次聚合的结果行数安全上限，命中打日志（正常远达不到）
	channelDimAggRowLimit = 50000
)

type chanDimKey struct {
	channelId int
	dayStart  int64
	userId    int
	modelName string
}

// channelDimUsageCache 与 channelUsageCache 共用 channelUsageCacheLock，由 FlushChannelUsage 一并交换落库
var channelDimUsageCache = make(map[chanDimKey]*channelUsageDelta)

// NormalizeChannelDimModelName 截断到列宽，热路径与回填共用，保证同一模型落同一主键
func NormalizeChannelDimModelName(name string) string {
	runes := []rune(name)
	if len(runes) <= channelDimModelNameMaxLen {
		return name
	}
	return string(runes[:channelDimModelNameMaxLen])
}

// IncrementChannelDimUsage 记录一次消费在 (渠道, 日, 用户, 模型) 维度的用量，与 IncrementChannelUsage
// 成对调用、参数同源。批量模式只做内存累加；关闭批量开关时逐请求同步 upsert。
func IncrementChannelDimUsage(channelId int, userId int, modelName string, quota int, officialQuota int64, promptTokens int, completionTokens int, ts int64) {
	if channelId <= 0 {
		return
	}
	if ts <= 0 {
		ts = common.GetTimestamp()
	}
	key := chanDimKey{
		channelId: channelId,
		dayStart:  ChannelUsageDayStart(ts),
		userId:    userId,
		modelName: NormalizeChannelDimModelName(modelName),
	}
	delta := channelUsageDelta{
		quota:            int64(quota),
		officialQuota:    officialQuota,
		promptTokens:     int64(promptTokens),
		completionTokens: int64(completionTokens),
		callCount:        1,
	}
	if !common.ChannelUsageBatchEnabled {
		if err := upsertChannelDimUsageRows(DB, []ChannelDailyDimUsage{channelDimRow(key, delta)}); err != nil {
			common.SysError(fmt.Sprintf("failed to upsert channel_daily_dim_usage: channel_id=%d, err=%v", channelId, err))
		}
		return
	}
	channelUsageCacheLock.Lock()
	d, ok := channelDimUsageCache[key]
	if !ok {
		d = &channelUsageDelta{}
		channelDimUsageCache[key] = d
	}
	d.add(delta)
	channelUsageCacheLock.Unlock()
}

func channelDimRow(key chanDimKey, d channelUsageDelta) ChannelDailyDimUsage {
	return ChannelDailyDimUsage{
		ChannelId:        key.channelId,
		DayStart:         key.dayStart,
		UserId:           key.userId,
		ModelName:        key.modelName,
		Quota:            d.quota,
		OfficialQuota:    d.officialQuota,
		PromptTokens:     d.promptTokens,
		CompletionTokens: d.completionTokens,
		CallCount:        d.callCount,
	}
}

// flushChannelDimUsage 把一次交换出来的维度增量批量落库；失败仅记日志并丢弃（同小时桶取舍）
func flushChannelDimUsage(pending map[chanDimKey]*channelUsageDelta) {
	if len(pending) == 0 {
		return
	}
	rows := make([]ChannelDailyDimUsage, 0, len(pending))
	for key, d := range pending {
		rows = append(rows, channelDimRow(key, *d))
	}
	if err := upsertChannelDimUsageRows(DB, rows); err != nil {
		common.SysError(fmt.Sprintf("failed to flush channel_daily_dim_usages: rows=%d, err=%v", len(rows), err))
	}
}

// channelDimAddExpr 冲突时「旧值 + 新值」；PG 的 DO UPDATE 右侧须带表前缀
func channelDimAddExpr(column string) clause.Expr {
	return gorm.Expr(fmt.Sprintf("channel_daily_dim_usages.%s + excluded.%s", column, column))
}

// upsertChannelDimUsageRows 多行累加 upsert。先按主键排序：多副本并发 flush 同一批键时
// 行锁获取顺序一致，避免 PG 多行 upsert 互相等待成死锁。
func upsertChannelDimUsageRows(db *gorm.DB, rows []ChannelDailyDimUsage) error {
	if len(rows) == 0 {
		return nil
	}
	sort.Slice(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if a.ChannelId != b.ChannelId {
			return a.ChannelId < b.ChannelId
		}
		if a.DayStart != b.DayStart {
			return a.DayStart < b.DayStart
		}
		if a.UserId != b.UserId {
			return a.UserId < b.UserId
		}
		return a.ModelName < b.ModelName
	})
	onConflict := clause.OnConflict{
		Columns: []clause.Column{{Name: "channel_id"}, {Name: "day_start"}, {Name: "user_id"}, {Name: "model_name"}},
		DoUpdates: clause.Assignments(map[string]any{
			"quota":             channelDimAddExpr("quota"),
			"official_quota":    channelDimAddExpr("official_quota"),
			"prompt_tokens":     channelDimAddExpr("prompt_tokens"),
			"completion_tokens": channelDimAddExpr("completion_tokens"),
			"call_count":        channelDimAddExpr("call_count"),
		}),
	}
	for start := 0; start < len(rows); start += channelDimUpsertBatch {
		chunk := rows[start:min(start+channelDimUpsertBatch, len(rows))]
		if err := db.Clauses(onConflict).Create(&chunk).Error; err != nil {
			return err
		}
	}
	return nil
}

// ReplaceChannelDimUsageDay 回填专用：同一事务内删掉某自然日的全部行再整批写入，重跑幂等。
// 只允许对已完结的自然日调用（热路径不再写该天），由 service 侧保证。
func ReplaceChannelDimUsageDay(dayStart int64, rows []ChannelDailyDimUsage) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("day_start = ?", dayStart).Delete(&ChannelDailyDimUsage{}).Error; err != nil {
			return fmt.Errorf("clear channel_daily_dim_usages day_start=%d: %w", dayStart, err)
		}
		for start := 0; start < len(rows); start += channelDimUpsertBatch {
			chunk := rows[start:min(start+channelDimUpsertBatch, len(rows))]
			if err := tx.Create(&chunk).Error; err != nil {
				return fmt.Errorf("insert channel_daily_dim_usages day_start=%d: %w", dayStart, err)
			}
		}
		return nil
	})
}

// ChannelDimUsageAgg 某渠道在区间内按单一维度（用户或模型）的聚合行
type ChannelDimUsageAgg struct {
	ChannelId        int    `json:"channel_id"`
	UserId           int    `json:"user_id"`
	ModelName        string `json:"model_name"`
	Quota            int64  `json:"quota"`
	OfficialQuota    int64  `json:"official_quota"`
	PromptTokens     int64  `json:"prompt_tokens"`
	CompletionTokens int64  `json:"completion_tokens"`
	CallCount        int64  `json:"call_count"`
}

const channelDimSumSelect = "SUM(quota) AS quota, SUM(official_quota) AS official_quota, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(call_count) AS call_count"

// AggregateChannelDimUsageByUser 按 (channel_id, user_id) 聚合 [start, endExclusive) 内的用量；
// modelName 非空时只统计该模型（明细面板「按模型反查用户」）。
func AggregateChannelDimUsageByUser(channelIds []int, start int64, endExclusive int64, modelName string) ([]ChannelDimUsageAgg, error) {
	tx := channelDimRangeQuery(channelIds, start, endExclusive)
	if modelName != "" {
		tx = tx.Where("model_name = ?", NormalizeChannelDimModelName(modelName))
	}
	return scanChannelDimAgg(tx.Select("channel_id, user_id, " + channelDimSumSelect).Group("channel_id, user_id"))
}

// AggregateChannelDimUsageByModel 按 (channel_id, model_name) 聚合 [start, endExclusive) 内的用量；
// userIds 非空时只统计这些用户（明细面板「按付款主体反查模型」）。
func AggregateChannelDimUsageByModel(channelIds []int, start int64, endExclusive int64, userIds []int) ([]ChannelDimUsageAgg, error) {
	tx := channelDimRangeQuery(channelIds, start, endExclusive)
	if len(userIds) > 0 {
		tx = tx.Where("user_id IN ?", userIds)
	}
	return scanChannelDimAgg(tx.Select("channel_id, model_name, " + channelDimSumSelect).Group("channel_id, model_name"))
}

func channelDimRangeQuery(channelIds []int, start int64, endExclusive int64) *gorm.DB {
	return DB.Model(&ChannelDailyDimUsage{}).
		Where("channel_id IN ?", channelIds).
		Where("day_start >= ? AND day_start < ?", start, endExclusive)
}

func scanChannelDimAgg(tx *gorm.DB) ([]ChannelDimUsageAgg, error) {
	rows := make([]ChannelDimUsageAgg, 0)
	if err := tx.Limit(channelDimAggRowLimit + 1).Scan(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) > channelDimAggRowLimit {
		common.SysLog(fmt.Sprintf("channel_daily_dim_usages aggregate exceeded %d rows, tail truncated", channelDimAggRowLimit))
		rows = rows[:channelDimAggRowLimit]
	}
	return rows, nil
}

// GetChannelDimUsageCoverageStart 返回明细表最早的数据日（零点 Unix 秒），无数据时为 0。
// 前端据此提示「明细统计自 X 日起」。
func GetChannelDimUsageCoverageStart() (int64, error) {
	var minDay int64
	err := DB.Model(&ChannelDailyDimUsage{}).Select("COALESCE(MIN(day_start), 0)").Scan(&minDay).Error
	return minDay, err
}

// SumLogNetQuotaByUsers 按用户汇总 [start, endExclusive) 内 logs 的净消耗（消费 − 退款）。
// 只给明细面板里的 Top 行用户估算「约可用天数」，用户数小（≤ 渠道数 × Top N），走 user_id 索引。
func SumLogNetQuotaByUsers(userIds []int, start int64, endExclusive int64) (map[int]int64, error) {
	out := make(map[int]int64)
	if len(userIds) == 0 {
		return out, nil
	}
	rows := make([]struct {
		UserId   int
		NetQuota int64
	}, 0)
	err := LOG_DB.Table("logs").
		Select(fmt.Sprintf("user_id, SUM(CASE WHEN type = %d THEN quota WHEN type = %d THEN -quota ELSE 0 END) AS net_quota", LogTypeConsume, LogTypeRefund)).
		Where("user_id IN ? AND type IN ? AND created_at >= ? AND created_at < ?", userIds, []int{LogTypeConsume, LogTypeRefund}, start, endExclusive).
		Group("user_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.UserId] = r.NetQuota
	}
	return out, nil
}
