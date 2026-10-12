package model

import (
	"context"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 「渠道消耗」统计（TokenFunc 二开，PostgreSQL only）。
//
// 三张表同源同口径，都在 RecordConsumeLog / RecordTaskBillingLog 的 consume 分支记账
// （退款不回减，user_id=0 的系统请求也计入），批量模式下同一次 FlushChannelUsage 落库：
//   - channel_hourly_usages   渠道 × 整小时      → 列表页的「区间 / 本月」
//   - channel_usage_totals    渠道累计            → 列表页的「总计」
//   - channel_daily_dim_usages 渠道 × 日 × 用户 × 模型 → 展开明细（用户 Top / 模型 Top）
//
// 取舍：批量模式（CHANNEL_USAGE_BATCH_ENABLED=true，默认）下进程崩溃最多丢失一个 flush 周期
// （30s）的统计增量。这是纯分析口径，不参与计费扣费，可接受；换来热路径零同步写。

// ChannelHourlyUsage 按渠道 + 整小时聚合的用量
type ChannelHourlyUsage struct {
	ChannelId        int   `json:"channel_id" gorm:"primaryKey;autoIncrement:false"`
	HourStart        int64 `json:"hour_start" gorm:"primaryKey;autoIncrement:false;index:idx_channel_hourly_usage_hour"`
	Quota            int64 `json:"quota" gorm:"not null;default:0"`
	OfficialQuota    int64 `json:"official_quota" gorm:"not null;default:0"`
	PromptTokens     int64 `json:"prompt_tokens" gorm:"not null;default:0"`
	CompletionTokens int64 `json:"completion_tokens" gorm:"not null;default:0"`
	CallCount        int64 `json:"call_count" gorm:"not null;default:0"`
}

func (ChannelHourlyUsage) TableName() string { return "channel_hourly_usages" }

// AlignToHour 将 unix 秒级时间戳对齐到整小时
func AlignToHour(ts int64) int64 {
	return ts - (ts % 3600)
}

// ChannelUsageDayStart 返回 ts 所在计费时区（Asia/Shanghai，与财务中心同口径）自然日零点
func ChannelUsageDayStart(ts int64) int64 {
	t := time.Unix(ts, 0).In(enterpriseBillingLocation)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, enterpriseBillingLocation).Unix()
}

// ChannelUsageMonthStart 返回 ts 所在计费时区自然月 1 日零点
func ChannelUsageMonthStart(ts int64) int64 {
	t := time.Unix(ts, 0).In(enterpriseBillingLocation)
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, enterpriseBillingLocation).Unix()
}

// ChannelUsageDayString 把零点时间戳格式化为计费时区的 YYYY-MM-DD
func ChannelUsageDayString(ts int64) string {
	return time.Unix(ts, 0).In(enterpriseBillingLocation).Format("2006-01-02")
}

// ComputeOfficialQuota 按官方价折算的产出价值：quota / group_ratio（剥离分组折扣）。
// group_ratio 缺失、非数值或 ≤0 时视为 1；热路径与回填共用同一口径。
func ComputeOfficialQuota(quota int, groupRatio float64) int64 {
	if quota == 0 {
		return 0
	}
	if groupRatio <= 0 || groupRatio == 1.0 {
		return int64(quota)
	}
	return int64(math.Round(float64(quota) / groupRatio))
}

// GroupRatioFromLogOther 从消费日志的 other 元数据里取 group_ratio（由 service.GenerateTextOtherInfo 写入 public 段）
func GroupRatioFromLogOther(other *LogOther) float64 {
	if other == nil {
		return 1.0
	}
	return groupRatioFromMap(other.Snapshot())
}

// GroupRatioFromLogOtherJSON 从已落库的 logs.other JSON 里取 group_ratio（回填用）
func GroupRatioFromLogOtherJSON(other string) float64 {
	if other == "" {
		return 1.0
	}
	var m map[string]any
	if err := common.UnmarshalJsonStr(other, &m); err != nil {
		return 1.0
	}
	return groupRatioFromMap(m)
}

func groupRatioFromMap(m map[string]any) float64 {
	switch v := m["group_ratio"].(type) {
	case float64:
		if v > 0 {
			return v
		}
	case float32:
		if v > 0 {
			return float64(v)
		}
	case int:
		if v > 0 {
			return float64(v)
		}
	}
	return 1.0
}

// recordChannelUsage 消费记账点统一入口：同一时间戳、同一官方价值同时写小时桶 / 累计与维度明细。
// 由 RecordConsumeLog / RecordTaskBillingLog 的 consume 分支调用；DB 未就绪或无渠道时直接返回。
func recordChannelUsage(channelId int, userId int, modelName string, quota int, promptTokens int, completionTokens int, other *LogOther) {
	if DB == nil || channelId <= 0 {
		return
	}
	officialQuota := ComputeOfficialQuota(quota, GroupRatioFromLogOther(other))
	ts := common.GetTimestamp()
	IncrementChannelUsage(channelId, quota, officialQuota, promptTokens, completionTokens, ts)
	IncrementChannelDimUsage(channelId, userId, modelName, quota, officialQuota, promptTokens, completionTokens, ts)
}

// channelUsageFlushInterval 批量 flush 周期，同时是崩溃时统计数据的最大丢失窗口
const channelUsageFlushInterval = 30 * time.Second

type chanHourKey struct {
	channelId int
	hourStart int64
}

type channelUsageDelta struct {
	quota            int64
	officialQuota    int64
	promptTokens     int64
	completionTokens int64
	callCount        int64
}

func (d *channelUsageDelta) add(o channelUsageDelta) {
	d.quota += o.quota
	d.officialQuota += o.officialQuota
	d.promptTokens += o.promptTokens
	d.completionTokens += o.completionTokens
	d.callCount += o.callCount
}

var (
	channelUsageCache     = make(map[chanHourKey]*channelUsageDelta)
	channelUsageCacheLock sync.Mutex
)

// IncrementChannelUsage 记录一次消费的渠道用量（小时桶 + 累计）。
// 批量模式只做内存累加，由 UpdateChannelUsageStats 周期性 FlushChannelUsage；
// 关闭开关时在调用栈里同步 upsert。
func IncrementChannelUsage(channelId int, quota int, officialQuota int64, promptTokens int, completionTokens int, ts int64) {
	if channelId <= 0 {
		return
	}
	if ts <= 0 {
		ts = common.GetTimestamp()
	}
	hour := AlignToHour(ts)
	delta := channelUsageDelta{
		quota:            int64(quota),
		officialQuota:    officialQuota,
		promptTokens:     int64(promptTokens),
		completionTokens: int64(completionTokens),
		callCount:        1,
	}
	if !common.ChannelUsageBatchEnabled {
		writeChannelUsageDelta(channelId, hour, delta)
		return
	}
	key := chanHourKey{channelId: channelId, hourStart: hour}
	channelUsageCacheLock.Lock()
	d, ok := channelUsageCache[key]
	if !ok {
		d = &channelUsageDelta{}
		channelUsageCache[key] = d
	}
	d.add(delta)
	channelUsageCacheLock.Unlock()
}

// writeChannelUsageDelta 把一份增量落库：小时桶 upsert + 累计行 upsert。
// PG 的 ON CONFLICT DO UPDATE 右侧列名必须带表前缀（否则 "column reference is ambiguous"）。
func writeChannelUsageDelta(channelId int, hour int64, d channelUsageDelta) {
	row := ChannelHourlyUsage{
		ChannelId:        channelId,
		HourStart:        hour,
		Quota:            d.quota,
		OfficialQuota:    d.officialQuota,
		PromptTokens:     d.promptTokens,
		CompletionTokens: d.completionTokens,
		CallCount:        d.callCount,
	}
	err := DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "channel_id"}, {Name: "hour_start"}},
		DoUpdates: clause.Assignments(map[string]any{
			"quota":             gorm.Expr("channel_hourly_usages.quota + excluded.quota"),
			"official_quota":    gorm.Expr("channel_hourly_usages.official_quota + excluded.official_quota"),
			"prompt_tokens":     gorm.Expr("channel_hourly_usages.prompt_tokens + excluded.prompt_tokens"),
			"completion_tokens": gorm.Expr("channel_hourly_usages.completion_tokens + excluded.completion_tokens"),
			"call_count":        gorm.Expr("channel_hourly_usages.call_count + excluded.call_count"),
		}),
	}).Create(&row).Error
	if err != nil {
		common.SysError(fmt.Sprintf("failed to upsert channel_hourly_usage: channel_id=%d, hour=%d, err=%v", channelId, hour, err))
	}
	if err := addChannelUsageTotal(DB, channelId, d); err != nil {
		common.SysError(fmt.Sprintf("failed to increment channel_usage_totals: channel_id=%d, err=%v", channelId, err))
	}
}

// FlushChannelUsage 把内存聚合的渠道用量增量批量落库。
// 持锁只做 map 指针交换，写库全部在锁外，避免 flush 期间阻塞热路径累加。
// 单个 key 写失败仅记日志并丢弃该增量（纯统计口径，不重试）。
func FlushChannelUsage() {
	channelUsageCacheLock.Lock()
	if len(channelUsageCache) == 0 && len(channelDimUsageCache) == 0 {
		channelUsageCacheLock.Unlock()
		return
	}
	pending := channelUsageCache
	channelUsageCache = make(map[chanHourKey]*channelUsageDelta)
	pendingDims := channelDimUsageCache
	channelDimUsageCache = make(map[chanDimKey]*channelUsageDelta)
	channelUsageCacheLock.Unlock()

	for key, d := range pending {
		writeChannelUsageDelta(key.channelId, key.hourStart, *d)
	}
	flushChannelDimUsage(pendingDims)
}

// UpdateChannelUsageStats 渠道用量批量 flush 后台任务；ctx 结束时做最后一次 flush。
func UpdateChannelUsageStats(ctx context.Context) {
	ticker := time.NewTicker(channelUsageFlushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			FlushChannelUsage()
			return
		case <-ticker.C:
			FlushChannelUsage()
		}
	}
}

// ChannelUsageWindowAgg 单渠道在某个时间窗口内的聚合
type ChannelUsageWindowAgg struct {
	ChannelId        int   `json:"channel_id"`
	Quota            int64 `json:"quota"`
	OfficialQuota    int64 `json:"official_quota"`
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	CallCount        int64 `json:"call_count"`
}

const channelHourlySumSelect = "channel_id, SUM(quota) AS quota, SUM(official_quota) AS official_quota, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(call_count) AS call_count"

// SumChannelUsageBetween 聚合所有渠道在 [start, endExclusive) 内的用量（SQL 侧 GROUP BY，不把小时桶拉进内存）。
// 两端需已对齐到小时边界；endExclusive <= 0 视为无上界。
func SumChannelUsageBetween(start int64, endExclusive int64) (map[int]ChannelUsageWindowAgg, error) {
	tx := DB.Model(&ChannelHourlyUsage{}).Select(channelHourlySumSelect).Where("hour_start >= ?", start)
	if endExclusive > 0 {
		tx = tx.Where("hour_start < ?", endExclusive)
	}
	rows := make([]ChannelUsageWindowAgg, 0)
	if err := tx.Group("channel_id").Scan(&rows).Error; err != nil {
		return nil, err
	}
	res := make(map[int]ChannelUsageWindowAgg, len(rows))
	for _, r := range rows {
		res[r.ChannelId] = r
	}
	return res, nil
}
