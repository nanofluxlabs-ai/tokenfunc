package model

import (
	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 授信预警档位
const (
	CreditNotifyKindWarn      = "warn"      // 已用达到预警阈值
	CreditNotifyKindExhausted = "exhausted" // 额度用尽（或预扣被拒）
)

// EnterpriseCreditNotifyRecord 授信预警发送记录：(period_id, kind) 为主键，多副本靠 ON CONFLICT 抢占，同一期同一档只发一次
type EnterpriseCreditNotifyRecord struct {
	PeriodId     int64  `json:"period_id" gorm:"primaryKey;autoIncrement:false"`
	Kind         string `json:"kind" gorm:"type:varchar(16);primaryKey"`
	EnterpriseId int    `json:"enterprise_id" gorm:"not null;index"`
	CreatedAt    int64  `json:"created_at" gorm:"not null"`
}

func (EnterpriseCreditNotifyRecord) TableName() string { return "ent_credit_notify_records" }

// ClaimCreditNotify 抢占某期某档的发送权：插入成功返回 true，已存在（本节点或其他副本已发）返回 false
func ClaimCreditNotify(periodId int64, kind string, enterpriseId int) (bool, error) {
	record := &EnterpriseCreditNotifyRecord{PeriodId: periodId, Kind: kind, EnterpriseId: enterpriseId, CreatedAt: common.GetTimestamp()}
	result := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(record)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

// resetCreditNotifyTx 删除某期某档的发送记录，允许再次触发（额度上调后预警阈值重新有效）
func resetCreditNotifyTx(tx *gorm.DB, periodId int64, kind string) error {
	return tx.Where("period_id = ? AND kind = ?", periodId, kind).Delete(&EnterpriseCreditNotifyRecord{}).Error
}
