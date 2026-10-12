package common

// ChannelUsageBatchEnabled 渠道消耗统计批量写开关（env: CHANNEL_USAGE_BATCH_ENABLED，默认 true）。
// true：model.IncrementChannelUsage 只做内存聚合，由 model.UpdateChannelUsageStats 周期性批量落库；
// false：逐请求同步写库（排障回退阀）。
var ChannelUsageBatchEnabled = true

// LoadChannelUsageSetting 在 .env 加载完成后读取开关；由 main.go 在启动 flush 循环前调用。
func LoadChannelUsageSetting() {
	ChannelUsageBatchEnabled = GetEnvOrDefaultBool("CHANNEL_USAGE_BATCH_ENABLED", true)
}
