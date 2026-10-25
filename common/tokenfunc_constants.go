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

// 数据库 logs 表的保留与归档（TokenFunc 二开，env DB_LOG_RETENTION_*）。
// ⚠️ 与上面的 LogRetentionDays（文件日志轮转天数）刻意分名：DBLogRetentionDays 控制的是 logs 表里的行。
// 默认 0 = 禁用，任务空转不删任何数据；生产显式配置（当前约定 90）。
var DBLogRetentionDays = 0

// DBLogRetentionRunAt 每天开始归档清理的时刻（上海时区 HH:MM）
var DBLogRetentionRunAt = "03:00"

// DBLogRetentionMaxDaysPerRun 单轮最多处理的天数，首次开启时分多天追平，避免一晚上扫全部历史
var DBLogRetentionMaxDaysPerRun = 30

// DBLogRetentionBatchLimit / DBLogRetentionBatchPauseMs 删除分批行数与批间停顿
var DBLogRetentionBatchLimit = 2000
var DBLogRetentionBatchPauseMs = 200

// LogArchiveS3* 归档对象存储（S3 兼容，当前为腾讯云 COS）；四个必填项缺一则任务拒绝删除
var LogArchiveS3Endpoint = ""
var LogArchiveS3Region = ""
var LogArchiveS3Bucket = ""
var LogArchiveS3Prefix = ""
var LogArchiveS3AccessKey = ""
var LogArchiveS3SecretKey = ""
var LogArchiveS3PathStyle = false
