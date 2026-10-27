package main

import (
	"fmt"

	"github.com/QuantumNous/new-api/model"

	"gorm.io/gorm"
)

type cleanupStep struct {
	name string
	run  func() *gorm.DB
}

// cleanupDemoData 删除上一次灌入的示例数据：按 demo_ 账号、它们名下的企业与成员登录账号、demo- 渠道、
// 示例模型的性能桶、示例线索逐表硬删。真实数据不在这些标记内，不受影响。
func cleanupDemoData() error {
	var ownerIds []int
	if err := model.DB.Unscoped().Model(&model.User{}).Where("username LIKE ?", demoUsernamePrefix+"%").Pluck("id", &ownerIds).Error; err != nil {
		return err
	}
	var enterpriseIds []int
	if len(ownerIds) > 0 {
		if err := model.DB.Model(&model.Enterprise{}).Where("user_id IN ?", ownerIds).Pluck("id", &enterpriseIds).Error; err != nil {
			return err
		}
	}
	userIds := append([]int{}, ownerIds...)
	if len(enterpriseIds) > 0 {
		var memberUserIds []int
		if err := model.DB.Unscoped().Model(&model.EnterpriseMember{}).Where("enterprise_id IN ? AND user_id > 0", enterpriseIds).Pluck("user_id", &memberUserIds).Error; err != nil {
			return err
		}
		userIds = append(userIds, memberUserIds...)
	}
	var channelIds []int
	if err := model.DB.Model(&model.Channel{}).Where("name LIKE ?", demoChannelPrefix+"%").Pluck("id", &channelIds).Error; err != nil {
		return err
	}

	steps := []cleanupStep{
		{"perf_metrics", func() *gorm.DB {
			return model.DB.Where("model_name IN ?", demoModelNames()).Delete(&model.PerfMetric{})
		}},
		{"ent_trial_leads", func() *gorm.DB {
			return model.DB.Where("contact LIKE ?", "%"+demoLeadEmailSuffix).Delete(&model.EnterpriseTrialLead{})
		}},
	}
	if len(userIds) > 0 {
		steps = append(steps,
			cleanupStep{"logs", func() *gorm.DB { return model.LOG_DB.Where("user_id IN ?", userIds).Delete(&model.Log{}) }},
			cleanupStep{"audit_logs", func() *gorm.DB { return model.LOG_DB.Where("user_id IN ?", userIds).Delete(&model.AuditLog{}) }},
			cleanupStep{"quota_data", func() *gorm.DB { return model.DB.Where("user_id IN ?", userIds).Delete(&model.QuotaData{}) }},
			cleanupStep{"top_ups", func() *gorm.DB { return model.DB.Where("user_id IN ?", userIds).Delete(&model.TopUp{}) }},
			cleanupStep{"tokens", func() *gorm.DB { return model.DB.Unscoped().Where("user_id IN ?", userIds).Delete(&model.Token{}) }},
			cleanupStep{"tf_log_daily_rollups", func() *gorm.DB { return model.DB.Where("user_id IN ?", userIds).Delete(&model.LogDailyRollup{}) }},
			cleanupStep{"tf_promoter_settlements", func() *gorm.DB {
				return model.DB.Where("promoter_user_id IN ?", userIds).Delete(&model.PromoterSettlement{})
			}},
			cleanupStep{"tf_promoter_bindings", func() *gorm.DB {
				return model.DB.Where("promoter_user_id IN ? OR user_id IN ?", userIds, userIds).Delete(&model.PromoterBinding{})
			}},
			cleanupStep{"tf_promoters", func() *gorm.DB { return model.DB.Where("user_id IN ?", userIds).Delete(&model.Promoter{}) }},
		)
	}
	if len(enterpriseIds) > 0 {
		var periodIds []int64
		if err := model.DB.Model(&model.EnterpriseCreditPeriod{}).Where("enterprise_id IN ?", enterpriseIds).Pluck("id", &periodIds).Error; err != nil {
			return err
		}
		var teamIds []int
		if err := model.DB.Unscoped().Model(&model.EnterpriseTeam{}).Where("enterprise_id IN ?", enterpriseIds).Pluck("id", &teamIds).Error; err != nil {
			return err
		}
		for _, table := range []any{
			&model.EnterpriseUsageDaily{}, &model.EnterpriseTokenAssignment{}, &model.EnterpriseTokenQuotaPolicy{},
			&model.EnterpriseLedgerEntry{}, &model.EnterpriseBill{}, &model.EnterpriseCreditPeriod{},
		} {
			if err := model.DB.Where("enterprise_id IN ?", enterpriseIds).Delete(table).Error; err != nil {
				return fmt.Errorf("cleanup %T: %w", table, err)
			}
		}
		if len(periodIds) > 0 {
			if err := model.DB.Exec("DELETE FROM ent_credit_notify_records WHERE period_id IN ?", periodIds).Error; err != nil {
				return err
			}
		}
		if len(teamIds) > 0 {
			if err := model.DB.Where("team_id IN ?", teamIds).Delete(&model.EnterpriseTeamBudgetNotify{}).Error; err != nil {
				return err
			}
		}
		if err := model.DB.Unscoped().Where("enterprise_id IN ?", enterpriseIds).Delete(&model.EnterpriseMember{}).Error; err != nil {
			return err
		}
		if err := model.DB.Unscoped().Where("enterprise_id IN ?", enterpriseIds).Delete(&model.EnterpriseTeam{}).Error; err != nil {
			return err
		}
		if err := model.DB.Where("id IN ?", enterpriseIds).Delete(&model.Enterprise{}).Error; err != nil {
			return err
		}
	}
	for _, step := range steps {
		if err := step.run().Error; err != nil {
			return fmt.Errorf("cleanup %s: %w", step.name, err)
		}
	}
	if len(userIds) > 0 {
		if err := model.DB.Unscoped().Where("id IN ?", userIds).Delete(&model.User{}).Error; err != nil {
			return err
		}
	}
	if len(channelIds) > 0 {
		if err := model.DB.Where("channel_id IN ?", channelIds).Delete(&model.Ability{}).Error; err != nil {
			return err
		}
		if err := model.DB.Where("id IN ?", channelIds).Delete(&model.Channel{}).Error; err != nil {
			return err
		}
	}
	fmt.Printf("清理上一次的示例数据：%d 个账号、%d 家企业、%d 个渠道\n", len(userIds), len(enterpriseIds), len(channelIds))
	return nil
}
