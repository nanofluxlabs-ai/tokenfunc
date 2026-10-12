package service

import (
	"fmt"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// 外部渠道健康态状态机（TokenFunc 二开）。
// 所有写路径（快探 / 慢探 / relay / 手动测试）都经这里：更新计数与维度健康、写事件、同步暂停派发集合。
// 失败处置统一为「软屏蔽」：不改 channels.status，只在分发时跳过；恢复后自动继续派发。

// ChannelHealthTransition 一次记录引起的状态变化
type ChannelHealthTransition struct {
	Paused  bool // 本次从可派发变为暂停派发
	Resumed bool // 本次从暂停派发恢复
}

// healthDimension 把 api / inference 两个维度的字段抽成同一套游标，状态流转逻辑只写一份
type healthDimension struct {
	name             string
	health           *string
	failCount        *int
	successCount     *int
	lastProbeAt      *int64
	lastError        *string
	failThreshold    int
	recoverThreshold int
}

func apiDimension(state *model.ChannelHealthState, setting *operation_setting.MonitorSetting) healthDimension {
	return healthDimension{
		name:             model.ChannelHealthDimensionApi,
		health:           &state.ApiHealth,
		failCount:        &state.ApiFailCount,
		successCount:     &state.ApiSuccessCount,
		lastProbeAt:      &state.LastApiProbeAt,
		lastError:        &state.LastApiError,
		failThreshold:    setting.ExternalChannelFastProbeFailThreshold,
		recoverThreshold: setting.ExternalChannelFastProbeRecoverThreshold,
	}
}

func inferenceDimension(state *model.ChannelHealthState, setting *operation_setting.MonitorSetting) healthDimension {
	return healthDimension{
		name:             model.ChannelHealthDimensionInference,
		health:           &state.InferenceHealth,
		failCount:        &state.InferenceFailCount,
		successCount:     &state.InferenceSuccessCount,
		lastProbeAt:      &state.LastInferenceProbeAt,
		lastError:        &state.LastInferenceError,
		failThreshold:    setting.ExternalChannelSlowProbeFailThreshold,
		recoverThreshold: setting.ExternalChannelSlowProbeRecoverThreshold,
	}
}

// applyHealthResult 单维度流转。immediate=true 时成功直接置 ok（relay / 手动测试），否则 failed 态下要连续成功达恢复阈值。
// 返回 (本次进入 failed, 本次离开 failed)。
func applyHealthResult(dim healthDimension, ok bool, immediate bool, detail string, now int64) (bool, bool) {
	*dim.lastProbeAt = now
	if ok {
		*dim.lastError = ""
		wasFailed := *dim.health == model.ChannelHealthFailed
		if wasFailed && !immediate {
			*dim.successCount++
			if *dim.successCount < dim.recoverThreshold {
				return false, false
			}
		}
		*dim.health = model.ChannelHealthOK
		*dim.failCount = 0
		*dim.successCount = 0
		return false, wasFailed
	}
	*dim.lastError = detail
	*dim.successCount = 0
	*dim.failCount++
	if *dim.health == model.ChannelHealthFailed {
		return false, false
	}
	if *dim.failCount >= dim.failThreshold {
		*dim.health = model.ChannelHealthFailed
		return true, false
	}
	return false, false
}

// channelHealthLocks 同一渠道的读改写串行化，避免快探与 relay 并发时互相覆盖计数
var channelHealthLocks sync.Map

func lockChannelHealth(channelId int) func() {
	value, _ := channelHealthLocks.LoadOrStore(channelId, &sync.Mutex{})
	mu := value.(*sync.Mutex)
	mu.Lock()
	return mu.Unlock
}

func recordChannelHealth(channel *model.Channel, pick func(*model.ChannelHealthState, *operation_setting.MonitorSetting) healthDimension, ok bool, immediate bool, source string, detail string) (ChannelHealthTransition, error) {
	transition := ChannelHealthTransition{}
	if channel == nil || !channel.GetIsExternal() {
		return transition, nil
	}
	unlock := lockChannelHealth(channel.Id)
	defer unlock()

	state, err := model.GetChannelHealthState(channel.Id)
	if err != nil {
		return transition, err
	}
	setting := operation_setting.GetMonitorSetting()
	dim := pick(state, setting)
	pausedBefore := state.IsDispatchPaused()
	enteredFailed, leftFailed := applyHealthResult(dim, ok, immediate, detail, common.GetTimestamp())
	if err := model.SaveChannelHealthState(state); err != nil {
		return transition, err
	}
	pausedAfter := state.IsDispatchPaused()
	transition.Paused = !pausedBefore && pausedAfter
	transition.Resumed = pausedBefore && !pausedAfter

	switch {
	case enteredFailed:
		recordHealthEvent(channel.Id, dim.name, model.ChannelHealthEventDispatchPaused, source, detail)
	case leftFailed:
		recordHealthEvent(channel.Id, dim.name, model.ChannelHealthEventDispatchResumed, source, "")
	case !ok && source == model.ChannelHealthSourceRelay:
		recordHealthEvent(channel.Id, dim.name, model.ChannelHealthEventRelayFailed, source, detail)
	case !ok:
		recordHealthEvent(channel.Id, dim.name, model.ChannelHealthEventProbeFailed, source, detail)
	}
	if transition.Paused {
		notifyChannelHealth(channel, fmt.Sprintf("外部渠道「%s」（#%d）已暂停派发", channel.Name, channel.Id), fmt.Sprintf("维度：%s，来源：%s，原因：%s", dim.name, source, common.LocalLogPreview(detail)))
	}
	if transition.Resumed {
		notifyChannelHealth(channel, fmt.Sprintf("外部渠道「%s」（#%d）已恢复派发", channel.Name, channel.Id), fmt.Sprintf("维度：%s，来源：%s", dim.name, source))
	}
	return transition, nil
}

func recordHealthEvent(channelId int, dimension, kind, source, detail string) {
	if err := model.RecordChannelHealthEvent(channelId, dimension, kind, source, detail); err != nil {
		common.SysLog(fmt.Sprintf("failed to record channel health event: channel_id=%d, kind=%s, error=%v", channelId, kind, err))
	}
}

func notifyChannelHealth(channel *model.Channel, subject, content string) {
	common.SysLog(subject + "，" + content)
	NotifyRootUser(fmt.Sprintf("channel_health_%d", channel.Id), subject, content)
}

// RecordChannelApiProbe 记录一次接口探测（快探）结果
func RecordChannelApiProbe(channel *model.Channel, ok bool, detail string) (ChannelHealthTransition, error) {
	return recordChannelHealth(channel, apiDimension, ok, false, model.ChannelHealthSourceFastProbe, detail)
}

// RecordChannelInferenceProbe 记录一次推理探测（慢探）结果
func RecordChannelInferenceProbe(channel *model.Channel, ok bool, detail string) (ChannelHealthTransition, error) {
	return recordChannelHealth(channel, inferenceDimension, ok, false, model.ChannelHealthSourceSlowProbe, detail)
}

// RecordChannelManualTestSuccess 手动测试成功直接把推理维度置 ok；失败不计数（手动测试可能带错模型）
func RecordChannelManualTestSuccess(channel *model.Channel) {
	if _, err := recordChannelHealth(channel, inferenceDimension, true, true, model.ChannelHealthSourceManualTest, ""); err != nil {
		common.SysLog(fmt.Sprintf("failed to record manual test success: channel_id=%d, error=%v", channel.Id, err))
	}
}

// externalInferenceFailing 本进程观察到推理失败计数 > 0 或 failed 态的外部渠道。
// relay 成功只对这些渠道写库，避免热路径每个请求都落一次 DB。
var externalInferenceFailing sync.Map

// RecordExternalChannelRelaySuccess relay 成功：推理维度直接置 ok 并清零计数（tokensolo 行为）
func RecordExternalChannelRelaySuccess(channel *model.Channel) {
	if channel == nil || !channel.GetIsExternal() {
		return
	}
	if _, failing := externalInferenceFailing.Load(channel.Id); !failing && !model.IsChannelDispatchPaused(channel.Id) {
		return
	}
	externalInferenceFailing.Delete(channel.Id)
	if _, err := recordChannelHealth(channel, inferenceDimension, true, true, model.ChannelHealthSourceRelay, ""); err != nil {
		common.SysLog(fmt.Sprintf("failed to record relay success: channel_id=%d, error=%v", channel.Id, err))
	}
}

// RecordExternalChannelRelayFailure relay 命中 5xx：推理维度累加失败计数（与慢探同阈值）
func RecordExternalChannelRelayFailure(channel *model.Channel, statusCode int, detail string) {
	if channel == nil || !channel.GetIsExternal() || statusCode < 500 || statusCode > 599 {
		return
	}
	externalInferenceFailing.Store(channel.Id, struct{}{})
	if _, err := recordChannelHealth(channel, inferenceDimension, false, false, model.ChannelHealthSourceRelay, fmt.Sprintf("HTTP %d: %s", statusCode, detail)); err != nil {
		common.SysLog(fmt.Sprintf("failed to record relay failure: channel_id=%d, error=%v", channel.Id, err))
	}
}
