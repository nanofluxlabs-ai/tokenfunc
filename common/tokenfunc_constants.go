package common

// tokenfunc 二开新增的全局配置项，与上游 constants.go 分离以减少同步冲突。

// ThemePreset 管理员选定的全站配色预设，经 /api/status 下发给前端，普通用户不可修改
var ThemePreset = "tokenfunc"

// SalesContactQRCodeImageURL 营销页"联系销售"弹窗展示的商务微信二维码图片地址
var SalesContactQRCodeImageURL = ""

// 系统日志（stdout / 文件）格式与滚动。LogFormatJSON 由 InitEnv 按 LOG_FORMAT 置位，
// 运行时默认 json；包级默认 false 让测试与未初始化路径保持上游文本格式。
var LogFormatJSON = false
var LogMaxSizeMB = 64
var LogMaxBackups = 32
var LogRetentionDays = 7
