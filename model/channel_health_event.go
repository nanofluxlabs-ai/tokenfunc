package model

import "github.com/QuantumNous/new-api/common"

// 健康事件类型
const (
	ChannelHealthEventProbeFailed     = "probe_failed"     // 单次探测失败（未达阈值）
	ChannelHealthEventDispatchPaused  = "dispatch_paused"  // 连续失败达阈值，开始暂停派发
	ChannelHealthEventDispatchResumed = "dispatch_resumed" // 恢复派发
	ChannelHealthEventRelayFailed     = "relay_failed"     // relay 命中 5xx
)

// 健康维度
const (
	ChannelHealthDimensionApi       = "api"
	ChannelHealthDimensionInference = "inference"
)

// 结果来源
const (
	ChannelHealthSourceFastProbe  = "fast_probe"
	ChannelHealthSourceSlowProbe  = "slow_probe"
	ChannelHealthSourceRelay      = "relay"
	ChannelHealthSourceManualTest = "manual_test"
)

// ChannelHealthEvent 外部渠道健康事件流水（TokenFunc 二开，PostgreSQL only），给列表 tooltip / 排障看
type ChannelHealthEvent struct {
	Id        int64  `json:"id" gorm:"primaryKey"`
	ChannelId int    `json:"channel_id" gorm:"index;not null"`
	Dimension string `json:"dimension" gorm:"type:varchar(16);not null"`
	Kind      string `json:"kind" gorm:"type:varchar(32);not null"`
	Source    string `json:"source" gorm:"type:varchar(32);not null"`
	Detail    string `json:"detail" gorm:"type:varchar(512);not null;default:''"`
	CreatedAt int64  `json:"created_at" gorm:"index;not null"`
}

func (ChannelHealthEvent) TableName() string { return "channel_health_events" }

// RecordChannelHealthEvent 写一条事件；detail 超长截断
func RecordChannelHealthEvent(channelId int, dimension, kind, source, detail string) error {
	if len(detail) > 512 {
		detail = detail[:512]
	}
	event := ChannelHealthEvent{
		ChannelId: channelId,
		Dimension: dimension,
		Kind:      kind,
		Source:    source,
		Detail:    detail,
		CreatedAt: common.GetTimestamp(),
	}
	return DB.Create(&event).Error
}

// GetChannelHealthEvents 渠道最近的事件，新的在前
func GetChannelHealthEvents(channelId int, limit int) ([]ChannelHealthEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 20
	}
	events := make([]ChannelHealthEvent, 0, limit)
	err := DB.Where("channel_id = ?", channelId).Order("id DESC").Limit(limit).Find(&events).Error
	return events, err
}

// PruneChannelHealthEvents 删除早于 before 的事件
func PruneChannelHealthEvents(before int64) error {
	return DB.Where("created_at < ?", before).Delete(&ChannelHealthEvent{}).Error
}
