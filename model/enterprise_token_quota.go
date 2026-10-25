package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 员工 key 周期限额（TokenFunc 二开，M4）
//
// 给企业 key 设「每日 / 每周 / 每月 / 自定义周期自动恢复到 X」：策略独立成表 ent_token_quota_policies，不给上游 tokens 表加列。
//   - 写入即施行：upsert 策略行后立刻把 tokens.remain_quota 置为周期额度、unlimited_quota=false，耗尽态 4 → 1；
//   - 到点重置：企业分钟任务（service/enterprise_credit_task.go）取 next_reset_at <= now 的策略，重置 remain_quota（不动 used_quota）并把 next_reset_at 以 now 为基准前移；
//   - 每次改 tokens 之前都先 invalidateTokenCacheForMutation（fence + DEL），Redis 开启时鉴权立刻看到新额度；
//   - key 软删时策略一并删除；任务遇到已软删的 key 也顺手清策略；disabled(2) 的 key 只重置额度不恢复启用。
// 周期边界按账期时区（enterpriseBillingLocation，上海）切分。

const (
	TokenQuotaResetNever   = "never"
	TokenQuotaResetDaily   = "daily"
	TokenQuotaResetWeekly  = "weekly"
	TokenQuotaResetMonthly = "monthly"
	TokenQuotaResetCustom  = "custom"

	// 自定义周期的秒数范围：1 小时 ～ 366 天
	TokenQuotaCustomMinSeconds = 3600
	TokenQuotaCustomMaxSeconds = 366 * 86400
	// 单次批量设置的 key 数上限（与批量启停一致）
	TokenQuotaPolicyBatchMax = 200
	// 分钟任务每轮最多处理的到期策略数
	tokenQuotaResetBatchSize = 500
)

var ErrEnterpriseTokenQuotaPolicy = errors.New("invalid periodic quota policy")

// EnterpriseTokenQuotaPolicy 周期限额策略：token_id 为主键，一把 key 最多一条
type EnterpriseTokenQuotaPolicy struct {
	TokenId       int    `json:"token_id" gorm:"primaryKey;autoIncrement:false"`
	EnterpriseId  int    `json:"enterprise_id" gorm:"not null;index"`
	ResetPeriod   string `json:"reset_period" gorm:"type:varchar(16);not null"`
	CustomSeconds int    `json:"custom_seconds" gorm:"not null;default:0"`
	PeriodQuota   int64  `json:"period_quota" gorm:"not null"`
	NextResetAt   int64  `json:"next_reset_at" gorm:"not null;index"`
	UpdatedAt     int64  `json:"updated_at" gorm:"not null"`
}

func (EnterpriseTokenQuotaPolicy) TableName() string { return "ent_token_quota_policies" }

// TokenQuotaPolicyInput 单条 / 批量设置共用的输入；ResetPeriod 为 never 表示删除策略
type TokenQuotaPolicyInput struct {
	ResetPeriod   string
	CustomSeconds int
	PeriodQuota   int64
}

// Validate 校验周期枚举、自定义秒数范围与额度范围；maxQuota 由调用方给出（controller 的 maxTokenQuota）
func (input TokenQuotaPolicyInput) Validate(maxQuota int64) error {
	switch input.ResetPeriod {
	case TokenQuotaResetNever:
		return nil
	case TokenQuotaResetDaily, TokenQuotaResetWeekly, TokenQuotaResetMonthly:
	case TokenQuotaResetCustom:
		if input.CustomSeconds < TokenQuotaCustomMinSeconds || input.CustomSeconds > TokenQuotaCustomMaxSeconds {
			return fmt.Errorf("%w: custom period must be between 1 hour and 366 days", ErrEnterpriseTokenQuotaPolicy)
		}
	default:
		return fmt.Errorf("%w: unknown reset period %q", ErrEnterpriseTokenQuotaPolicy, input.ResetPeriod)
	}
	if input.PeriodQuota <= 0 || input.PeriodQuota > maxQuota {
		return fmt.Errorf("%w: period quota out of range", ErrEnterpriseTokenQuotaPolicy)
	}
	return nil
}

// NextTokenQuotaResetAt 以 now 为基准算下一次重置时刻：daily 次日 00:00、weekly 下周一 00:00、monthly 下月 1 日 00:00（账期时区）、custom = now + 秒数
func NextTokenQuotaResetAt(period string, customSeconds int, now int64) int64 {
	local := time.Unix(now, 0).In(enterpriseBillingLocation)
	switch period {
	case TokenQuotaResetDaily:
		return time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, enterpriseBillingLocation).Unix()
	case TokenQuotaResetWeekly:
		// 距下周一的天数：周一当天算 7 天后
		days := (int(time.Monday) - int(local.Weekday()) + 7) % 7
		if days == 0 {
			days = 7
		}
		return time.Date(local.Year(), local.Month(), local.Day()+days, 0, 0, 0, 0, enterpriseBillingLocation).Unix()
	case TokenQuotaResetMonthly:
		return time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, enterpriseBillingLocation).AddDate(0, 1, 0).Unix()
	default:
		return now + int64(customSeconds)
	}
}

// applyTokenQuotaReset 把 key 的剩余额度置为周期额度：unlimited 关闭、耗尽态恢复启用，disabled 保持；调用方须先失效缓存
func applyTokenQuotaReset(tx *gorm.DB, tokenIds []int, periodQuota int64) (int64, error) {
	result := tx.Model(&Token{}).Where("id IN ? AND deleted_at IS NULL", tokenIds).Updates(map[string]any{
		"remain_quota":    periodQuota,
		"unlimited_quota": false,
		"status":          gorm.Expr("CASE WHEN status = ? THEN ? ELSE status END", common.TokenStatusExhausted, common.TokenStatusEnabled),
	})
	return result.RowsAffected, result.Error
}

// SetTokenQuotaPolicies 单条 / 批量设置策略（≤ 200，全成功或全失败）：范围外的 id 整批 404；never 删行且不动 tokens；
// 其余 upsert 后写入即施行。tokens 的更新行数必须等于 key 数，否则回滚
func SetTokenQuotaPolicies(enterpriseId int, ownerUserId int, scope EnterpriseScope, tokenIds []int, input TokenQuotaPolicyInput) error {
	if len(tokenIds) > TokenQuotaPolicyBatchMax {
		return fmt.Errorf("%w: at most %d keys per batch", ErrEnterpriseTokenQuotaPolicy, TokenQuotaPolicyBatchMax)
	}
	tokens, err := listEnterpriseTokensInScope(enterpriseId, ownerUserId, scope, tokenIds)
	if err != nil {
		return err
	}
	ids := make([]int, 0, len(tokens))
	for _, token := range tokens {
		ids = append(ids, token.Id)
	}
	if input.ResetPeriod == TokenQuotaResetNever {
		return DB.Where("token_id IN ?", ids).Delete(&EnterpriseTokenQuotaPolicy{}).Error
	}
	if err := invalidateTokensCache(tokens); err != nil {
		common.SysLog(common.LogText("failed to invalidate token cache before quota policy update: %s", err.Error()))
	}
	now := common.GetTimestamp()
	nextResetAt := NextTokenQuotaResetAt(input.ResetPeriod, input.CustomSeconds, now)
	policies := make([]EnterpriseTokenQuotaPolicy, 0, len(ids))
	for _, id := range ids {
		policies = append(policies, EnterpriseTokenQuotaPolicy{
			TokenId: id, EnterpriseId: enterpriseId, ResetPeriod: input.ResetPeriod, CustomSeconds: input.CustomSeconds,
			PeriodQuota: input.PeriodQuota, NextResetAt: nextResetAt, UpdatedAt: now,
		})
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "token_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"enterprise_id", "reset_period", "custom_seconds", "period_quota", "next_reset_at", "updated_at"}),
		}).Create(&policies).Error
		if err != nil {
			return err
		}
		affected, err := applyTokenQuotaReset(tx, ids, input.PeriodQuota)
		if err != nil {
			return err
		}
		if affected != int64(len(ids)) {
			return ErrEnterpriseResourceNotFound
		}
		return nil
	})
}

// createTokenQuotaPolicy 新建 key 时在同一事务里写策略；key 尚未被读过，不需要失效缓存
func createTokenQuotaPolicy(tx *gorm.DB, enterpriseId int, tokenId int, input TokenQuotaPolicyInput, now int64) error {
	return tx.Create(&EnterpriseTokenQuotaPolicy{
		TokenId: tokenId, EnterpriseId: enterpriseId, ResetPeriod: input.ResetPeriod, CustomSeconds: input.CustomSeconds,
		PeriodQuota: input.PeriodQuota, NextResetAt: NextTokenQuotaResetAt(input.ResetPeriod, input.CustomSeconds, now), UpdatedAt: now,
	}).Error
}

// dueTokenQuotaPolicy 到期策略与 key 的存活状态：LiveTokenId 为 0 表示 key 已软删或不存在
type dueTokenQuotaPolicy struct {
	EnterpriseTokenQuotaPolicy
	LiveTokenId int    `gorm:"column:live_token_id"`
	TokenKey    string `gorm:"column:token_key"`
}

// ResetDueTokenQuotaPolicies 分钟任务：重置到期的 key 额度并前移 next_reset_at；返回重置数。
// 每条按 (token_id, next_reset_at) 乐观更新，补跑或多副本重复执行时同一期只重置一次
func ResetDueTokenQuotaPolicies(now int64) (int, error) {
	var due []dueTokenQuotaPolicy
	err := DB.Table("ent_token_quota_policies AS p").
		Select("p.*, COALESCE(tokens.id, 0) AS live_token_id, COALESCE(tokens."+commonKeyCol+", '') AS token_key").
		Joins("LEFT JOIN tokens ON tokens.id = p.token_id AND tokens.deleted_at IS NULL").
		Where("p.next_reset_at <= ?", now).
		Order("p.next_reset_at ASC").
		Limit(tokenQuotaResetBatchSize).
		Scan(&due).Error
	if err != nil {
		return 0, err
	}
	reset := 0
	for _, policy := range due {
		if policy.LiveTokenId == 0 {
			if err := DB.Where("token_id = ?", policy.TokenId).Delete(&EnterpriseTokenQuotaPolicy{}).Error; err != nil {
				return reset, err
			}
			continue
		}
		if err := invalidateTokenCacheForMutation(policy.TokenKey); err != nil {
			common.SysLog(common.LogText("failed to invalidate token cache before periodic quota reset: %s", err.Error()))
		}
		claimed := false
		err := DB.Transaction(func(tx *gorm.DB) error {
			claim := tx.Model(&EnterpriseTokenQuotaPolicy{}).
				Where("token_id = ? AND next_reset_at = ?", policy.TokenId, policy.NextResetAt).
				Updates(map[string]any{
					"next_reset_at": NextTokenQuotaResetAt(policy.ResetPeriod, policy.CustomSeconds, now),
					"updated_at":    now,
				})
			if claim.Error != nil {
				return claim.Error
			}
			if claim.RowsAffected == 0 {
				return nil
			}
			claimed = true
			_, err := applyTokenQuotaReset(tx, []int{policy.TokenId}, policy.PeriodQuota)
			return err
		})
		if err != nil {
			return reset, err
		}
		if claimed {
			reset++
		}
	}
	return reset, nil
}
