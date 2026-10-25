package model

import "time"

// TokenFunc 二开跨包共用的数据库辅助。

// BillingLocation 计费与统计使用的时区（Asia/Shanghai），供 service / controller 复用
func BillingLocation() *time.Location {
	return enterpriseBillingLocation
}

// InitColumnNames 按当前主库 / 日志库类型重算保留字列名（group / key）。
// InitDB 内部已调用；供 service、controller 的 PG 测试夹具在替换 DB / LOG_DB 后调用，
// 否则 logGroupCol 为空，含 "group" 列的二开 SQL 会报语法错误。
func InitColumnNames() {
	initCol()
}
