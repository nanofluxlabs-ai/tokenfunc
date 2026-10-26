package model

import (
	"time"

	"github.com/QuantumNous/new-api/common"
)

// backfillEnterpriseBillTokens 给加列前出的账单回填 token 消耗（TokenFunc 二开，仅 PostgreSQL）：
// 授信账单按 period_id、月度对账单按账期日区间从 ent_usage_daily 求和；两列都为 0 才处理，幂等
func backfillEnterpriseBillTokens() error {
	if DB == nil || common.MainDatabaseType() != common.DatabaseTypePostgreSQL {
		return nil
	}
	bills := make([]*EnterpriseBill, 0)
	if err := DB.Select("id, enterprise_id, period_id, bill_type, period_start, period_end").
		Where("prompt_tokens = 0 AND completion_tokens = 0").Find(&bills).Error; err != nil {
		return err
	}
	for _, bill := range bills {
		query := DB.Model(&EnterpriseUsageDaily{}).Where("enterprise_id = ?", bill.EnterpriseId)
		if bill.BillType == EnterpriseBillTypeCredit && bill.PeriodId > 0 {
			query = query.Where("period_id = ?", bill.PeriodId)
		} else {
			fromDay := time.Unix(bill.PeriodStart, 0).In(enterpriseBillingLocation).Format("2006-01-02")
			toDay := time.Unix(bill.PeriodEnd-1, 0).In(enterpriseBillingLocation).Format("2006-01-02")
			query = query.Where("day BETWEEN ? AND ?", fromDay, toDay)
		}
		var detail enterpriseUsageDetailTotals
		if err := query.Select(enterpriseUsageDetailTotalsSelect).Scan(&detail).Error; err != nil {
			return err
		}
		if detail.PromptTokens == 0 && detail.CompletionTokens == 0 {
			continue
		}
		if err := DB.Model(&EnterpriseBill{}).Where("id = ?", bill.Id).
			Updates(map[string]any{"prompt_tokens": detail.PromptTokens, "completion_tokens": detail.CompletionTokens}).Error; err != nil {
			return err
		}
	}
	return nil
}
