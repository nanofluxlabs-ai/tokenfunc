package controller

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// 外部渠道探测（TokenFunc 二开）。两个系统任务：
//   - 快探 external_fast_probe：GET base_url + fast_probe_url，只看接口是否可达（2xx）
//   - 慢探 external_slow_probe：走 testChannel 发真实推理请求
// 结果交给 service 状态机；多实例去重与进度上报由系统任务框架负责。

const (
	externalFastProbeTimeout       = 10 * time.Second
	externalProbeUserAgent         = "tokenfunc/channel-probe"
	channelHealthEventRetention    = 30 * 24 * time.Hour
	postCreateChannelCheckParallel = 4
)

// externalProbeSummary 一轮探测的结果，作为系统任务 result 持久化
type externalProbeSummary struct {
	Probed    int `json:"probed"`
	Succeeded int `json:"succeeded"`
	Failed    int `json:"failed"`
	Paused    int `json:"paused"`
	Resumed   int `json:"resumed"`
}

func (s *externalProbeSummary) add(ok bool, transition service.ChannelHealthTransition) {
	s.Probed++
	if ok {
		s.Succeeded++
	} else {
		s.Failed++
	}
	if transition.Paused {
		s.Paused++
	}
	if transition.Resumed {
		s.Resumed++
	}
}

// ---- 快探 ----

type externalFastProbeHandler struct{}

func (externalFastProbeHandler) Type() string { return model.SystemTaskTypeExternalFastProbe }

func (externalFastProbeHandler) Enabled() bool {
	return operation_setting.GetMonitorSetting().ExternalChannelFastProbeEnabled
}

func (externalFastProbeHandler) Interval() time.Duration {
	return time.Duration(operation_setting.GetMonitorSetting().ExternalChannelFastProbeSeconds) * time.Second
}

func (externalFastProbeHandler) NewPayload() any { return nil }

func (externalFastProbeHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary, err := runExternalFastProbeTask(ctx, service.NewSystemTaskProgressReporter(task, runnerID))
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

// probeChannelEndpoint 对渠道做一次 GET 探测：网络错误 / 超时 / 5xx 为临时故障，401 为永久故障，404 / 429 等不计入
func probeChannelEndpoint(ctx context.Context, channel *model.Channel) (service.ChannelHealthVerdict, string) {
	probePath := channel.GetFastProbeURL()
	url := probePath
	if !strings.HasPrefix(probePath, "http://") && !strings.HasPrefix(probePath, "https://") {
		url = strings.TrimRight(channel.GetBaseURL(), "/") + "/" + strings.TrimLeft(probePath, "/")
	}
	probeCtx, cancel := context.WithTimeout(ctx, externalFastProbeTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, url, nil)
	if err != nil {
		return service.ChannelHealthVerdictTransient, "invalid probe url: " + err.Error()
	}
	key, _, keyErr := channel.GetNextEnabledKey()
	if keyErr != nil {
		key = channel.Key
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("x-api-key", key)
	req.Header.Set("User-Agent", externalProbeUserAgent)
	settings := channel.GetSetting()
	client, err := service.GetHttpClientWithProxySettings(settings.Proxy, settings)
	if err != nil {
		return service.ChannelHealthVerdictTransient, "http client: " + err.Error()
	}
	resp, err := client.Do(req)
	if err != nil {
		return service.ChannelHealthVerdictTransient, err.Error()
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
	return service.ClassifyChannelApiProbeStatus(resp.StatusCode), fmt.Sprintf("HTTP %d", resp.StatusCode)
}

func runExternalFastProbeTask(ctx context.Context, report func(processed, total int)) (externalProbeSummary, error) {
	summary := externalProbeSummary{}
	channels, err := model.GetExternalChannels()
	if err != nil {
		return summary, err
	}
	targets := make([]*model.Channel, 0, len(channels))
	for _, channel := range channels {
		if channel.Status == common.ChannelStatusManuallyDisabled {
			continue
		}
		targets = append(targets, channel)
	}
	total := len(targets)
	if report != nil {
		report(0, total)
	}
	for i, channel := range targets {
		if ctx.Err() != nil {
			return summary, ctx.Err()
		}
		verdict, detail := probeChannelEndpoint(ctx, channel)
		transition, recordErr := service.RecordChannelApiProbe(channel, verdict, detail)
		if recordErr != nil {
			common.SysLog(fmt.Sprintf("failed to record api probe: channel_id=%d, error=%v", channel.Id, recordErr))
		}
		summary.add(verdict == service.ChannelHealthVerdictOK, transition)
		if report != nil {
			report(i+1, total)
		}
		if common.RequestInterval > 0 && i < total-1 {
			select {
			case <-ctx.Done():
				return summary, ctx.Err()
			case <-time.After(common.RequestInterval):
			}
		}
	}
	pruneChannelHealthRows()
	return summary, nil
}

// pruneChannelHealthRows 顺带清理：已删除渠道的健康行、过期事件
func pruneChannelHealthRows() {
	if err := model.DeleteOrphanChannelHealthRows(); err != nil {
		common.SysLog("failed to delete orphan channel health rows: " + err.Error())
	}
	before := time.Now().Add(-channelHealthEventRetention).Unix()
	if err := model.PruneChannelHealthEvents(before); err != nil {
		common.SysLog("failed to prune channel health events: " + err.Error())
	}
}

// ---- 慢探 ----

type externalSlowProbeHandler struct{}

func (externalSlowProbeHandler) Type() string { return model.SystemTaskTypeExternalSlowProbe }

func (externalSlowProbeHandler) Enabled() bool {
	return operation_setting.GetMonitorSetting().ExternalChannelSlowProbeEnabled
}

func (externalSlowProbeHandler) Interval() time.Duration {
	return time.Duration(operation_setting.GetMonitorSetting().ExternalChannelSlowProbeSeconds) * time.Second
}

func (externalSlowProbeHandler) NewPayload() any { return nil }

func (externalSlowProbeHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary, err := runExternalSlowProbeTask(ctx, service.NewSystemTaskProgressReporter(task, runnerID))
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

// probeChannelInference 对渠道发一次真实推理请求并记录到推理维度；成功时更新响应时间
func probeChannelInference(ctx context.Context, channel *model.Channel, testUserID int) (bool, service.ChannelHealthTransition) {
	tik := time.Now()
	result := testChannel(ctx, channel, testUserID, "", "", shouldUseStreamForAutomaticChannelTest(channel))
	milliseconds := time.Since(tik).Milliseconds()
	if ctx.Err() != nil {
		return false, service.ChannelHealthTransition{}
	}
	verdict := service.ClassifyChannelHealthFailure(result.newAPIError, service.ChannelHealthFailureFromProbe)
	detail := ""
	switch {
	case result.newAPIError != nil:
		detail = result.newAPIError.MaskSensitiveErrorWithStatusCode()
	case result.localErr != nil:
		// 本地错误（不支持测试、未定价等）是网关配置问题，不是渠道不可用
		verdict = service.ChannelHealthVerdictIgnore
		detail = result.localErr.Error()
	}
	ok := verdict == service.ChannelHealthVerdictOK
	if ok {
		channel.UpdateResponseTime(milliseconds)
	}
	if verdict == service.ChannelHealthVerdictIgnore {
		common.SysLog(fmt.Sprintf("inference probe ignored: channel_id=%d, detail=%s", channel.Id, common.LocalLogPreview(detail)))
	}
	transition, err := service.RecordChannelInferenceProbe(channel, verdict, detail)
	if err != nil {
		common.SysLog(fmt.Sprintf("failed to record inference probe: channel_id=%d, error=%v", channel.Id, err))
	}
	// 推理探测开启后上游定时测试跳过外部渠道，这里接管「自动启用」：被上游自动禁用的外部渠道推理成功即恢复（同受 AutomaticEnableChannelEnabled 控制）。
	// 接口探测只证明接口可达，不据此启用。
	if ok && service.ShouldEnableChannel(nil, channel.Status) {
		usingKey := ""
		if result.context != nil {
			usingKey = common.GetContextKeyString(result.context, constant.ContextKeyChannelKey)
		}
		service.EnableChannel(channel.Id, usingKey, channel.Name)
	}
	return ok, transition
}

func runExternalSlowProbeTask(ctx context.Context, report func(processed, total int)) (externalProbeSummary, error) {
	summary := externalProbeSummary{}
	testUserID, err := resolveChannelTestUserID(nil)
	if err != nil {
		return summary, err
	}
	channels, err := model.GetExternalChannels()
	if err != nil {
		return summary, err
	}
	// 接口探测失败的渠道照样测推理：接口探测可能误判（上游不提供探测接口等），推理结果才是渠道能否派发的依据
	targets := make([]*model.Channel, 0, len(channels))
	for _, channel := range channels {
		if channel.Status == common.ChannelStatusManuallyDisabled {
			continue
		}
		targets = append(targets, channel)
	}
	concurrency := operation_setting.GetMonitorSetting().ChannelTestConcurrency
	testSummary := runChannelTestWorkers(ctx, targets, concurrency, func(ctx context.Context, channel *model.Channel) channelTestSummary {
		ok, transition := probeChannelInference(ctx, channel, testUserID)
		if ctx.Err() != nil {
			return channelTestSummary{}
		}
		// 复用 channelTestSummary 做 worker 归约：Disabled / Enabled 槽位承载暂停 / 恢复计数
		out := channelTestSummary{Tested: 1}
		if ok {
			out.Succeeded = 1
		} else {
			out.Failed = 1
		}
		if transition.Paused {
			out.Disabled = 1
		}
		if transition.Resumed {
			out.Enabled = 1
		}
		return out
	}, report)
	if ctx.Err() != nil {
		return summary, ctx.Err()
	}
	summary = externalProbeSummary{
		Probed:    testSummary.Tested,
		Succeeded: testSummary.Succeeded,
		Failed:    testSummary.Failed,
		Paused:    testSummary.Disabled,
		Resumed:   testSummary.Enabled,
	}
	return summary, nil
}

// ---- 新建渠道后的首次检查 ----

// runPostCreateChannelChecks 新建渠道后异步测一次：写响应时间；外部渠道同时跑一次快探与推理结果记录。
// 不触发自动禁用，与手动测试语义一致。
func runPostCreateChannelChecks(channelIds []int) {
	if len(channelIds) == 0 {
		return
	}
	testUserID, err := resolveChannelTestUserID(nil)
	if err != nil {
		common.SysLog("post-create channel check skipped: " + err.Error())
		return
	}
	semaphore := make(chan struct{}, postCreateChannelCheckParallel)
	for _, channelId := range channelIds {
		semaphore <- struct{}{}
		go func(channelId int) {
			defer func() { <-semaphore }()
			channel, err := model.GetChannelById(channelId, true)
			if err != nil {
				return
			}
			ctx := context.Background()
			tik := time.Now()
			result := testChannel(ctx, channel, testUserID, "", "", shouldUseStreamForAutomaticChannelTest(channel))
			if result.localErr == nil {
				channel.UpdateResponseTime(time.Since(tik).Milliseconds())
			}
			if !channel.GetIsExternal() {
				return
			}
			if result.localErr == nil && result.newAPIError == nil {
				service.RecordChannelManualTestSuccess(channel)
			}
			verdict, detail := probeChannelEndpoint(ctx, channel)
			if _, err := service.RecordChannelApiProbe(channel, verdict, detail); err != nil {
				common.SysLog(fmt.Sprintf("failed to record post-create api probe: channel_id=%d, error=%v", channel.Id, err))
			}
		}(channelId)
	}
	for range postCreateChannelCheckParallel {
		semaphore <- struct{}{}
	}
}
