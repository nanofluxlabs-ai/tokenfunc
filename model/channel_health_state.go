package model

import (
	"sync"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm/clause"
)

// 渠道健康维度取值
const (
	ChannelHealthUnknown = "unknown"
	ChannelHealthOK      = "ok"
	ChannelHealthFailed  = "failed"
)

// ChannelHealthState 外部渠道的健康态（TokenFunc 二开，PostgreSQL only）。
// 接口可用性（api）由 GET 探测决定，推理可用性（inference）由推理探测 / relay 结果决定。
// 任一维度为 failed 时渠道「暂停派发」：分发时跳过，但不改 channels.status，自动恢复后继续派发。
// 计数持久化在这里，重启不丢；放独立表避免给上游 Channel 加高频写列。
type ChannelHealthState struct {
	ChannelId             int    `json:"channel_id" gorm:"primaryKey;autoIncrement:false"`
	ApiHealth             string `json:"api_health" gorm:"type:varchar(16);not null;default:'unknown'"`
	InferenceHealth       string `json:"inference_health" gorm:"type:varchar(16);not null;default:'unknown'"`
	ApiFailCount          int    `json:"api_fail_count" gorm:"not null;default:0"`
	ApiSuccessCount       int    `json:"api_success_count" gorm:"not null;default:0"`
	InferenceFailCount    int    `json:"inference_fail_count" gorm:"not null;default:0"`
	InferenceSuccessCount int    `json:"inference_success_count" gorm:"not null;default:0"`
	LastApiProbeAt        int64  `json:"last_api_probe_at" gorm:"not null;default:0"`
	LastInferenceProbeAt  int64  `json:"last_inference_probe_at" gorm:"not null;default:0"`
	LastApiError          string `json:"last_api_error" gorm:"type:varchar(512);not null;default:''"`
	LastInferenceError    string `json:"last_inference_error" gorm:"type:varchar(512);not null;default:''"`
	UpdatedAt             int64  `json:"updated_at" gorm:"not null;default:0"`
	// DispatchPaused 派生字段，给前端直接用
	DispatchPaused bool `json:"dispatch_paused" gorm:"-"`
}

func (ChannelHealthState) TableName() string { return "channel_health_states" }

// IsDispatchPaused 任一维度 failed 即暂停派发
func (s *ChannelHealthState) IsDispatchPaused() bool {
	return s.ApiHealth == ChannelHealthFailed || s.InferenceHealth == ChannelHealthFailed
}

func (s *ChannelHealthState) fillDerived() {
	if s.ApiHealth == "" {
		s.ApiHealth = ChannelHealthUnknown
	}
	if s.InferenceHealth == "" {
		s.InferenceHealth = ChannelHealthUnknown
	}
	s.DispatchPaused = s.IsDispatchPaused()
}

// NewChannelHealthState 未探测过的渠道的初始态
func NewChannelHealthState(channelId int) *ChannelHealthState {
	return &ChannelHealthState{ChannelId: channelId, ApiHealth: ChannelHealthUnknown, InferenceHealth: ChannelHealthUnknown}
}

// GetChannelHealthState 读单个渠道健康态，没有记录时返回初始态（不报错）
func GetChannelHealthState(channelId int) (*ChannelHealthState, error) {
	states, err := GetChannelHealthStates([]int{channelId})
	if err != nil {
		return nil, err
	}
	if state, ok := states[channelId]; ok {
		return state, nil
	}
	state := NewChannelHealthState(channelId)
	state.fillDerived()
	return state, nil
}

// GetChannelHealthStates 批量读健康态，只返回有记录的渠道
func GetChannelHealthStates(channelIds []int) (map[int]*ChannelHealthState, error) {
	out := make(map[int]*ChannelHealthState, len(channelIds))
	if len(channelIds) == 0 {
		return out, nil
	}
	var rows []*ChannelHealthState
	if err := DB.Where("channel_id IN ?", channelIds).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		row.fillDerived()
		out[row.ChannelId] = row
	}
	return out, nil
}

// SaveChannelHealthState 整行 upsert，并同步进程内的暂停派发集合
func SaveChannelHealthState(state *ChannelHealthState) error {
	state.fillDerived()
	state.UpdatedAt = common.GetTimestamp()
	err := DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "channel_id"}},
		UpdateAll: true,
	}).Create(state).Error
	if err != nil {
		return err
	}
	setChannelDispatchPaused(state.ChannelId, state.DispatchPaused)
	return nil
}

// AttachChannelHealthStates 给列表里的外部渠道装配健康态；非外部渠道保持 nil
func AttachChannelHealthStates(channels []*Channel) error {
	ids := make([]int, 0, len(channels))
	for _, channel := range channels {
		if channel != nil && channel.GetIsExternal() {
			ids = append(ids, channel.Id)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	states, err := GetChannelHealthStates(ids)
	if err != nil {
		return err
	}
	for _, channel := range channels {
		if channel == nil || !channel.GetIsExternal() {
			continue
		}
		if state, ok := states[channel.Id]; ok {
			channel.HealthState = state
			continue
		}
		state := NewChannelHealthState(channel.Id)
		state.fillDerived()
		channel.HealthState = state
	}
	return nil
}

// DeleteOrphanChannelHealthRows 清掉已删除渠道留下的健康态与事件（探测任务每轮顺带执行，不改上游删除路径）
func DeleteOrphanChannelHealthRows() error {
	if err := DB.Exec("DELETE FROM channel_health_states WHERE channel_id NOT IN (SELECT id FROM channels)").Error; err != nil {
		return err
	}
	return DB.Exec("DELETE FROM channel_health_events WHERE channel_id NOT IN (SELECT id FROM channels)").Error
}

// ---- 暂停派发集合（内存缓存分发路径用；DB 分发路径直接查表）----

var (
	channelDispatchPausedMu sync.RWMutex
	channelDispatchPaused   = map[int]struct{}{}
)

func setChannelDispatchPaused(channelId int, paused bool) {
	channelDispatchPausedMu.Lock()
	defer channelDispatchPausedMu.Unlock()
	if paused {
		channelDispatchPaused[channelId] = struct{}{}
		return
	}
	delete(channelDispatchPaused, channelId)
}

// IsChannelDispatchPaused 渠道是否因健康态被暂停派发
func IsChannelDispatchPaused(channelId int) bool {
	channelDispatchPausedMu.RLock()
	defer channelDispatchPausedMu.RUnlock()
	_, paused := channelDispatchPaused[channelId]
	return paused
}

// ReloadChannelHealthStates 从库重建暂停派发集合；随渠道缓存同步周期执行，多实例靠这个收敛
func ReloadChannelHealthStates() {
	var ids []int
	err := DB.Table("channel_health_states").
		Joins("JOIN channels ON channels.id = channel_health_states.channel_id AND channels.is_external = ?", true).
		Where("channel_health_states.api_health = ? OR channel_health_states.inference_health = ?", ChannelHealthFailed, ChannelHealthFailed).
		Pluck("channel_health_states.channel_id", &ids).Error
	if err != nil {
		common.SysLog("failed to reload channel health states: " + err.Error())
		return
	}
	next := make(map[int]struct{}, len(ids))
	for _, id := range ids {
		next[id] = struct{}{}
	}
	channelDispatchPausedMu.Lock()
	channelDispatchPaused = next
	channelDispatchPausedMu.Unlock()
}

// excludeDispatchPausedIDs 内存缓存分发路径的 AND 门：去掉暂停派发的渠道
func excludeDispatchPausedIDs(ids []int) []int {
	channelDispatchPausedMu.RLock()
	defer channelDispatchPausedMu.RUnlock()
	if len(channelDispatchPaused) == 0 {
		return ids
	}
	kept := make([]int, 0, len(ids))
	for _, id := range ids {
		if _, paused := channelDispatchPaused[id]; paused {
			continue
		}
		kept = append(kept, id)
	}
	return kept
}

// excludeDispatchPausedAbilities DB 分发路径的 AND 门：直接查表，不依赖进程内集合
func excludeDispatchPausedAbilities(abilities []Ability) []Ability {
	if len(abilities) == 0 {
		return abilities
	}
	ids := make([]int, 0, len(abilities))
	for _, ability := range abilities {
		ids = append(ids, ability.ChannelId)
	}
	var paused []int
	err := DB.Table("channel_health_states").
		Joins("JOIN channels ON channels.id = channel_health_states.channel_id AND channels.is_external = ?", true).
		Where("channel_health_states.channel_id IN ?", ids).
		Where("channel_health_states.api_health = ? OR channel_health_states.inference_health = ?", ChannelHealthFailed, ChannelHealthFailed).
		Pluck("channel_health_states.channel_id", &paused).Error
	if err != nil || len(paused) == 0 {
		return abilities
	}
	pausedSet := make(map[int]struct{}, len(paused))
	for _, id := range paused {
		pausedSet[id] = struct{}{}
	}
	kept := make([]Ability, 0, len(abilities))
	for _, ability := range abilities {
		if _, isPaused := pausedSet[ability.ChannelId]; isPaused {
			continue
		}
		kept = append(kept, ability)
	}
	return kept
}
