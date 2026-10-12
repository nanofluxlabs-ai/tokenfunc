package operation_setting

import (
	"fmt"
	"os"
	"strconv"

	"github.com/QuantumNous/new-api/setting/config"
)

type MonitorSetting struct {
	AutoTestChannelEnabled bool    `json:"auto_test_channel_enabled"`
	AutoTestChannelMinutes float64 `json:"auto_test_channel_minutes"`
	ChannelTestMode        string  `json:"channel_test_mode"`
	ChannelTestConcurrency int     `json:"channel_test_concurrency"`

	// TokenFunc 二开：外部渠道探测。快探 = GET 接口可用性；慢探 = 真实推理请求。
	// 连续失败达 FailThreshold 进入 failed（暂停派发），failed 态下连续成功达 RecoverThreshold 恢复。
	ExternalChannelFastProbeEnabled          bool `json:"external_channel_fast_probe_enabled"`
	ExternalChannelFastProbeSeconds          int  `json:"external_channel_fast_probe_seconds"`
	ExternalChannelFastProbeFailThreshold    int  `json:"external_channel_fast_probe_fail_threshold"`
	ExternalChannelFastProbeRecoverThreshold int  `json:"external_channel_fast_probe_recover_threshold"`
	ExternalChannelSlowProbeEnabled          bool `json:"external_channel_slow_probe_enabled"`
	ExternalChannelSlowProbeSeconds          int  `json:"external_channel_slow_probe_seconds"`
	ExternalChannelSlowProbeFailThreshold    int  `json:"external_channel_slow_probe_fail_threshold"`
	ExternalChannelSlowProbeRecoverThreshold int  `json:"external_channel_slow_probe_recover_threshold"`
}

const (
	ChannelTestModeScheduledAll    = "scheduled_all"
	ChannelTestModeAutoBanOnly     = "auto_ban_only"
	ChannelTestModePassiveRecovery = "passive_recovery"

	ChannelTestConcurrencyOptionKey = "monitor_setting.channel_test_concurrency"
	DefaultChannelTestConcurrency   = 1
	MaxChannelTestConcurrency       = 32

	// 外部渠道探测的下限与默认值
	MinExternalChannelFastProbeSeconds     = 5
	MinExternalChannelSlowProbeSeconds     = 30
	DefaultExternalChannelFastProbeSeconds = 30
	DefaultExternalChannelSlowProbeSeconds = 300
)

// 默认配置
var monitorSetting = MonitorSetting{
	AutoTestChannelEnabled: false,
	AutoTestChannelMinutes: 10,
	ChannelTestMode:        ChannelTestModeScheduledAll,
	ChannelTestConcurrency: DefaultChannelTestConcurrency,

	ExternalChannelFastProbeEnabled:          false,
	ExternalChannelFastProbeSeconds:          DefaultExternalChannelFastProbeSeconds,
	ExternalChannelFastProbeFailThreshold:    3,
	ExternalChannelFastProbeRecoverThreshold: 2,
	ExternalChannelSlowProbeEnabled:          false,
	ExternalChannelSlowProbeSeconds:          DefaultExternalChannelSlowProbeSeconds,
	ExternalChannelSlowProbeFailThreshold:    2,
	ExternalChannelSlowProbeRecoverThreshold: 1,
}

// ExternalProbeOptionKeys 外部渠道探测的 option key（请求策略白名单与前端共用）
var ExternalProbeOptionKeys = []string{
	"monitor_setting.external_channel_fast_probe_enabled",
	"monitor_setting.external_channel_fast_probe_seconds",
	"monitor_setting.external_channel_fast_probe_fail_threshold",
	"monitor_setting.external_channel_fast_probe_recover_threshold",
	"monitor_setting.external_channel_slow_probe_enabled",
	"monitor_setting.external_channel_slow_probe_seconds",
	"monitor_setting.external_channel_slow_probe_fail_threshold",
	"monitor_setting.external_channel_slow_probe_recover_threshold",
}

// ValidateExternalProbeOptions 校验请求策略里提交的外部渠道探测配置（秒数不低于下限，阈值至少为 1）
func ValidateExternalProbeOptions(raw map[string]string) error {
	for _, key := range []string{"monitor_setting.external_channel_fast_probe_enabled", "monitor_setting.external_channel_slow_probe_enabled"} {
		if _, err := strconv.ParseBool(raw[key]); err != nil {
			return fmt.Errorf("invalid boolean: %s", key)
		}
	}
	minimums := map[string]int{
		"monitor_setting.external_channel_fast_probe_seconds":           MinExternalChannelFastProbeSeconds,
		"monitor_setting.external_channel_slow_probe_seconds":           MinExternalChannelSlowProbeSeconds,
		"monitor_setting.external_channel_fast_probe_fail_threshold":    1,
		"monitor_setting.external_channel_fast_probe_recover_threshold": 1,
		"monitor_setting.external_channel_slow_probe_fail_threshold":    1,
		"monitor_setting.external_channel_slow_probe_recover_threshold": 1,
	}
	for key, minimum := range minimums {
		value, err := strconv.Atoi(raw[key])
		if err != nil || value < minimum {
			return fmt.Errorf("%s must be an integer no less than %d", key, minimum)
		}
	}
	return nil
}

// normalizeExternalProbeSetting 把低于下限的值拉回下限，避免库里的脏值把探测打成高频
func normalizeExternalProbeSetting(setting *MonitorSetting) {
	setting.ExternalChannelFastProbeSeconds = max(setting.ExternalChannelFastProbeSeconds, MinExternalChannelFastProbeSeconds)
	setting.ExternalChannelSlowProbeSeconds = max(setting.ExternalChannelSlowProbeSeconds, MinExternalChannelSlowProbeSeconds)
	setting.ExternalChannelFastProbeFailThreshold = max(setting.ExternalChannelFastProbeFailThreshold, 1)
	setting.ExternalChannelFastProbeRecoverThreshold = max(setting.ExternalChannelFastProbeRecoverThreshold, 1)
	setting.ExternalChannelSlowProbeFailThreshold = max(setting.ExternalChannelSlowProbeFailThreshold, 1)
	setting.ExternalChannelSlowProbeRecoverThreshold = max(setting.ExternalChannelSlowProbeRecoverThreshold, 1)
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("monitor_setting", &monitorSetting)
}

func GetMonitorSetting() *MonitorSetting {
	if os.Getenv("CHANNEL_TEST_FREQUENCY") != "" {
		frequency, err := strconv.Atoi(os.Getenv("CHANNEL_TEST_FREQUENCY"))
		if err == nil && frequency > 0 {
			monitorSetting.AutoTestChannelEnabled = true
			monitorSetting.AutoTestChannelMinutes = float64(frequency)
			monitorSetting.ChannelTestMode = ChannelTestModeScheduledAll
		}
	}
	if enabled, ok := os.LookupEnv("CHANNEL_TEST_ENABLED"); ok {
		parsed, err := strconv.ParseBool(enabled)
		if err == nil {
			monitorSetting.AutoTestChannelEnabled = parsed
		}
	}
	switch monitorSetting.ChannelTestMode {
	case ChannelTestModeAutoBanOnly, ChannelTestModePassiveRecovery:
	default:
		monitorSetting.ChannelTestMode = ChannelTestModeScheduledAll
	}
	monitorSetting.ChannelTestConcurrency = NormalizeChannelTestConcurrency(monitorSetting.ChannelTestConcurrency)
	normalizeExternalProbeSetting(&monitorSetting)
	return &monitorSetting
}

func NormalizeChannelTestConcurrency(concurrency int) int {
	if concurrency < 1 {
		return DefaultChannelTestConcurrency
	}
	if concurrency > MaxChannelTestConcurrency {
		return MaxChannelTestConcurrency
	}
	return concurrency
}

func ValidateChannelTestConcurrency(value string) error {
	concurrency, err := strconv.Atoi(value)
	if err != nil || concurrency < 1 || concurrency > MaxChannelTestConcurrency {
		return fmt.Errorf("channel test concurrency must be between 1 and %d", MaxChannelTestConcurrency)
	}
	return nil
}
