package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ChannelUsageTotal 渠道全部时间的累计用量（TokenFunc 二开，PostgreSQL only）。
// 上游 channels.used_quota 已经维护了"实际扣费"累计，这里补官方价值 / token / 调用次数三组累计，
// 放独立表而不是给上游 Channel 加列，避免后续合并上游时在 model/channel.go 上冲突。
// 与 channel_hourly_usages 同源同口径：同一次 flush 一起累加；回填时整表重建。
type ChannelUsageTotal struct {
	ChannelId        int   `json:"channel_id" gorm:"primaryKey;autoIncrement:false"`
	OfficialQuota    int64 `json:"official_quota" gorm:"not null;default:0"`
	PromptTokens     int64 `json:"prompt_tokens" gorm:"not null;default:0"`
	CompletionTokens int64 `json:"completion_tokens" gorm:"not null;default:0"`
	CallCount        int64 `json:"call_count" gorm:"not null;default:0"`
	UpdatedAt        int64 `json:"updated_at" gorm:"not null;default:0"`
}

func (ChannelUsageTotal) TableName() string { return "channel_usage_totals" }

// channelUsageTotalAddExpr 冲突时「旧值 + 新值」；PG 的 DO UPDATE 右侧必须带表前缀，否则列名二义
func channelUsageTotalAddExpr(column string) clause.Expr {
	return gorm.Expr(fmt.Sprintf("channel_usage_totals.%s + excluded.%s", column, column))
}

// addChannelUsageTotal 把一份增量累加到渠道的累计行（不存在则新建）
func addChannelUsageTotal(db *gorm.DB, channelId int, d channelUsageDelta) error {
	row := ChannelUsageTotal{
		ChannelId:        channelId,
		OfficialQuota:    d.officialQuota,
		PromptTokens:     d.promptTokens,
		CompletionTokens: d.completionTokens,
		CallCount:        d.callCount,
		UpdatedAt:        common.GetTimestamp(),
	}
	return db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "channel_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"official_quota":    channelUsageTotalAddExpr("official_quota"),
			"prompt_tokens":     channelUsageTotalAddExpr("prompt_tokens"),
			"completion_tokens": channelUsageTotalAddExpr("completion_tokens"),
			"call_count":        channelUsageTotalAddExpr("call_count"),
			"updated_at":        gorm.Expr("excluded.updated_at"),
		}),
	}).Create(&row).Error
}

// GetChannelUsageTotals 一次性读出全部渠道的累计行（渠道数级别，列表页用）
func GetChannelUsageTotals() (map[int]ChannelUsageTotal, error) {
	rows := make([]ChannelUsageTotal, 0)
	if err := DB.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[int]ChannelUsageTotal, len(rows))
	for _, r := range rows {
		out[r.ChannelId] = r
	}
	return out, nil
}

// ReplaceChannelUsageTotals 回填专用：同一事务内清空后整批写入
func ReplaceChannelUsageTotals(rows []ChannelUsageTotal) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1 = 1").Delete(&ChannelUsageTotal{}).Error; err != nil {
			return fmt.Errorf("clear channel_usage_totals: %w", err)
		}
		if len(rows) == 0 {
			return nil
		}
		return tx.CreateInBatches(&rows, 500).Error
	})
}
