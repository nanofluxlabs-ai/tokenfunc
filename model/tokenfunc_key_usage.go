package model

import "github.com/QuantumNous/new-api/common"

// GetTokenLogs 某把 key 的日志分页（TokenFunc 二开：公开用量查询页）；可见范围与 GetUserLogs 一致
func GetTokenLogs(tokenId int, filter LogFilter, startIdx int, num int) (logs []*Log, total int64, err error) {
	tx, err := filter.apply(LOG_DB.Where("logs.token_id = ?", tokenId))
	if err != nil {
		return nil, 0, err
	}
	err = tx.Model(&Log{}).Limit(logSearchCountLimit).Count(&total).Error
	if err != nil {
		common.SysError(common.LogText("failed to count token logs: %s", err.Error()))
		return nil, 0, common.NewMessage("Failed to query logs")
	}
	order := "logs.id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("logs.")
	}
	err = tx.Order(order).Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		common.SysError(common.LogText("failed to search token logs: %s", err.Error()))
		return nil, 0, common.NewMessage("Failed to query logs")
	}
	formatUserLogs(logs, startIdx)
	return logs, total, nil
}
