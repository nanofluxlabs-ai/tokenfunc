package model

import (
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// 推广人结算（TokenFunc 二开，仅 PostgreSQL）：一行 = 一个推广人一个自然月的「已结算」标记。
// 系统不计算分成金额，只记录管理员线下结算后的状态、可选的实付金额与流水号；
// 撤销不删行，写 reverted_at 留痕，再次标记插入新行（部分唯一索引只约束活跃行）。
// 没有行的月份即「待结算」，由 service 按月份列表补成虚拟行。

type PromoterSettlement struct {
	Id             int64  `json:"id"`
	PromoterUserId int    `json:"promoter_user_id" gorm:"not null;uniqueIndex:uk_tf_promoter_settlement_active,priority:1,where:reverted_at IS NULL"`
	Month          string `json:"month" gorm:"type:varchar(7);not null;uniqueIndex:uk_tf_promoter_settlement_active,priority:2,where:reverted_at IS NULL"`
	// 标记时的快照：月净消耗 / 其中授信待回款 / 当时的分成比例，只供日后对账
	NetQuotaSnapshot     int64               `json:"net_quota_snapshot" gorm:"not null;default:0"`
	CreditUnpaidSnapshot int64               `json:"credit_unpaid_snapshot" gorm:"not null;default:0"`
	ShareRateSnapshot    float64             `json:"share_rate_snapshot" gorm:"type:numeric(5,2);not null;default:0"`
	AmountUSD            decimal.NullDecimal `json:"amount_usd" gorm:"type:numeric(20,6)"`
	Reference            string              `json:"reference" gorm:"type:varchar(128);not null;default:''"`
	Remark               string              `json:"remark" gorm:"type:varchar(255);not null;default:''"`
	SettledAt            int64               `json:"settled_at" gorm:"not null;default:0"`
	SettledBy            int                 `json:"settled_by" gorm:"not null;default:0"`
	RevertedAt           *int64              `json:"reverted_at"`
	RevertedBy           int                 `json:"reverted_by" gorm:"not null;default:0"`
	CreatedAt            int64               `json:"created_at" gorm:"not null;default:0"`
	UpdatedAt            int64               `json:"updated_at" gorm:"not null;default:0"`
}

func (PromoterSettlement) TableName() string { return "tf_promoter_settlements" }

// GetActivePromoterSettlement 某推广人某月的活跃结算记录；没有返回 gorm.ErrRecordNotFound
func GetActivePromoterSettlement(promoterUserId int, month string) (*PromoterSettlement, error) {
	var settlement PromoterSettlement
	err := DB.Where("promoter_user_id = ? AND month = ? AND reverted_at IS NULL", promoterUserId, month).First(&settlement).Error
	if err != nil {
		return nil, err
	}
	return &settlement, nil
}

// ListActivePromoterSettlements 某推广人全部活跃结算记录，按月份倒序
func ListActivePromoterSettlements(promoterUserId int) ([]*PromoterSettlement, error) {
	settlements := make([]*PromoterSettlement, 0)
	err := DB.Where("promoter_user_id = ? AND reverted_at IS NULL", promoterUserId).Order("month DESC").Find(&settlements).Error
	return settlements, err
}

// CreatePromoterSettlement 写入结算记录；同月已有活跃记录时返回唯一冲突错误，由调用方翻译
func CreatePromoterSettlement(settlement *PromoterSettlement) error {
	return DB.Create(settlement).Error
}

// RevertPromoterSettlement 撤销某月结算（留痕）；没有活跃记录返回 gorm.ErrRecordNotFound
func RevertPromoterSettlement(promoterUserId int, month string, operatorId int, now int64) error {
	result := DB.Model(&PromoterSettlement{}).
		Where("promoter_user_id = ? AND month = ? AND reverted_at IS NULL", promoterUserId, month).
		Updates(map[string]any{"reverted_at": now, "reverted_by": operatorId, "updated_at": now})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// ListEnterpriseIdsByUserIds 给定用户中的企业主账号 → 企业 id（不过滤计费模式：切回预付的企业，历史授信账期仍要识别）
func ListEnterpriseIdsByUserIds(userIds []int) (map[int]int, error) {
	result := make(map[int]int)
	if len(userIds) == 0 {
		return result, nil
	}
	var rows []struct {
		Id     int
		UserId int
	}
	if err := DB.Model(&Enterprise{}).Select("id, user_id").Where("user_id IN ?", userIds).Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.UserId] = row.Id
	}
	return result, nil
}

// ListCreditPeriodsOverlapping 与区间有交集的授信账期，按企业、起点升序
func ListCreditPeriodsOverlapping(enterpriseIds []int, r FinanceRange) ([]*EnterpriseCreditPeriod, error) {
	periods := make([]*EnterpriseCreditPeriod, 0)
	if len(enterpriseIds) == 0 {
		return periods, nil
	}
	err := DB.Where("enterprise_id IN ? AND start_at < ? AND end_at > ?", enterpriseIds, r.EndExcl, r.Start).
		Order("enterprise_id, start_at").Find(&periods).Error
	return periods, err
}

// GetBillStatusesByIds 账单 id → 状态
func GetBillStatusesByIds(billIds []int64) (map[int64]string, error) {
	result := make(map[int64]string, len(billIds))
	if len(billIds) == 0 {
		return result, nil
	}
	var rows []struct {
		Id     int64
		Status string
	}
	if err := DB.Model(&EnterpriseBill{}).Select("id, status").Where("id IN ?", billIds).Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.Id] = row.Status
	}
	return result, nil
}
