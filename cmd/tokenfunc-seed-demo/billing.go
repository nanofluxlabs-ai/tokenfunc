package main

import (
	"fmt"
	"math"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/shopspring/decimal"
)

// 企业账期与账单：出账 / 收款 / 作废 / 充值 / 月结单都走 model 层函数（流水与快照由它们写），
// 这些函数只认「现在」，所以调用后把时间戳回溯到账期结束后的合理时刻。

// billOutcome 一张授信账单出账后的去向
type billOutcome string

const (
	billUnpaid  billOutcome = "unpaid"
	billPartial billOutcome = "partial"
	billPaid    billOutcome = "paid"
	billVoid    billOutcome = "void"
	billDiff    billOutcome = "paid_with_diff" // 出账时计数器比明细多一点，进对账差异告警
)

// 从最近一期往前排的账单去向；更早的一律已付清
var billOutcomes = map[string][]billOutcome{
	"acme":    {billUnpaid, billPartial, billPaid},
	"initech": {billUnpaid, billDiff, billVoid},
}

func (s *seeder) seedEnterpriseBilling() error {
	for _, demo := range s.enterprises {
		var err error
		if len(demo.Periods) > 0 {
			err = s.seedCreditBilling(demo)
		} else {
			err = s.seedPrepaidBilling(demo)
		}
		if err != nil {
			return fmt.Errorf("%s: %w", demo.Key, err)
		}
	}
	return nil
}

func (s *seeder) seedCreditBilling(demo *demoEnterprise) error {
	open := demo.Periods[len(demo.Periods)-1]
	openUsed := s.agg.periods[open.Id]
	elapsed := math.Max(0.05, float64(s.now.Unix()-open.StartAt)/float64(open.EndAt-open.StartAt))
	var maxClosed int64
	for _, period := range demo.Periods[:len(demo.Periods)-1] {
		maxClosed = max(maxClosed, s.agg.periods[period.Id])
	}
	// 额度：按本期进度外推的整期用量留 15% 余量，且让本期已用落在 6~8 成
	limit := roundUpUSD(math.Max(math.Max(float64(openUsed)/elapsed*1.15, float64(openUsed)/0.78), float64(maxClosed)*1.1), 100)
	if err := model.DB.Model(&model.Enterprise{}).Where("id = ?", demo.Ent.Id).Update("credit_limit_quota", limit).Error; err != nil {
		return err
	}
	if err := model.DB.Model(&model.EnterpriseCreditPeriod{}).Where("enterprise_id = ?", demo.Ent.Id).Update("limit_quota", limit).Error; err != nil {
		return err
	}
	detail := mustJSON(map[string]any{"before": map[string]any{"billing_mode": model.EnterpriseBillingModePrepaid},
		"after": map[string]any{"billing_mode": model.EnterpriseBillingModeCredit, "cycle_type": demo.Ent.CreditCycleType,
			"cycle_days": demo.Ent.CreditCycleDays, "limit_quota": limit, "alert_percent": demo.Ent.CreditAlertPercent}})
	if err := model.DB.Create(&model.EnterpriseLedgerEntry{EnterpriseId: demo.Ent.Id, Type: model.EnterpriseLedgerCreditLimitChange,
		RefType: "credit_period", RefId: demo.Periods[0].Id, OperatorId: s.rootId, Detail: model.JSONValue(detail),
		CreatedAt: demo.Periods[0].StartAt - 3600}).Error; err != nil {
		return err
	}

	closed := demo.Periods[:len(demo.Periods)-1]
	outcomes := billOutcomes[demo.Key]
	terms := int64(demo.Ent.PaymentTermsDays)
	for i, period := range closed {
		outcome := billPaid
		if recency := len(closed) - 1 - i; recency < len(outcomes) {
			outcome = outcomes[recency]
		}
		if outcome == billDiff {
			// 计数器多记 $3.6：模拟出账时在途请求的结算尾差
			if err := model.DB.Model(&model.EnterpriseCreditPeriod{}).Where("id = ?", period.Id).
				Update("used_quota", s.agg.periods[period.Id]+quotaOfUSD(3.6)).Error; err != nil {
				return err
			}
		}
		bill, err := model.IssueCreditBill(period.Id)
		if err != nil {
			return err
		}
		if bill == nil {
			continue
		}
		issuedAt := period.EndAt + 2*3600 + int64(s.rng.IntN(3600))
		billNo := fmt.Sprintf("TF-%s-%06d", time.Unix(issuedAt, 0).In(s.loc).Format("200601"), bill.Id)
		if err := model.DB.Model(&model.EnterpriseBill{}).Where("id = ?", bill.Id).Updates(map[string]any{
			"issued_at": issuedAt, "due_at": issuedAt + terms*86400, "bill_no": billNo, "created_at": issuedAt, "updated_at": issuedAt,
		}).Error; err != nil {
			return err
		}
		if err := model.DB.Model(&model.EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{
			"billed_at": issuedAt, "updated_at": issuedAt,
		}).Error; err != nil {
			return err
		}
		if err := s.backdateBillLedger(bill.Id, model.EnterpriseLedgerBillIssued, issuedAt, billNo); err != nil {
			return err
		}
		switch outcome {
		case billPaid, billDiff:
			err = s.payBill(bill.Id, bill.TotalUSD, issuedAt+int64(6+s.rng.IntN(8))*86400, billNo)
		case billPartial:
			err = s.payBill(bill.Id, bill.TotalUSD.Mul(decimal.NewFromFloat(0.6)).Round(2), issuedAt+12*86400, billNo)
		case billVoid:
			if err = model.VoidBill(bill.Id, s.rootId, "合同调整，本期改为线下结算"); err == nil {
				voidAt := issuedAt + 4*86400
				err = s.backdateBillLedger(bill.Id, model.EnterpriseLedgerAdjustment, voidAt, billNo)
				if err == nil {
					err = model.DB.Model(&model.EnterpriseBill{}).Where("id = ?", bill.Id).Update("updated_at", voidAt).Error
				}
			}
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *seeder) payBill(billId int64, amount decimal.Decimal, paidAt int64, billNo string) error {
	bill, err := model.RegisterBillPayment(billId, amount, s.rootId, "DEMO-WIRE-"+billNo[3:], "银行转账")
	if err != nil {
		return err
	}
	updates := map[string]any{"updated_at": paidAt}
	if bill.Status == model.EnterpriseBillPaid {
		updates["paid_at"] = paidAt
	}
	if err := model.DB.Model(&model.EnterpriseBill{}).Where("id = ?", billId).Updates(updates).Error; err != nil {
		return err
	}
	return s.backdateBillLedger(billId, model.EnterpriseLedgerBillPayment, paidAt, billNo)
}

// backdateBillLedger 把某张账单最新一条指定类型的流水时间回溯
func (s *seeder) backdateBillLedger(billId int64, entryType string, at int64, billNo string) error {
	var entry model.EnterpriseLedgerEntry
	if err := model.DB.Where("ref_type = ? AND ref_id = ? AND type = ?", model.EnterpriseLedgerRefBill, billId, entryType).
		Order("id DESC").First(&entry).Error; err != nil {
		return err
	}
	return model.DB.Model(&model.EnterpriseLedgerEntry{}).Where("id = ?", entry.Id).
		Updates(map[string]any{"created_at": at, "reference": billNo}).Error
}

// seedPrepaidBilling 预付企业：按月充值（覆盖下月消耗再留余量）+ 一笔补偿调账，
// 再按月重放余额生成月结单，最后把每条钱包流水的「变动后余额」按真实时间线重算
func (s *seeder) seedPrepaidBilling(demo *demoEnterprise) error {
	userId := demo.Owner.Id
	var topupTimes []int64
	for month := s.start; month.Before(s.now); month = month.AddDate(0, 1, 0) {
		topupTimes = append(topupTimes, month.Unix()-2*86400+10*3600)
	}
	if s.agg.users[userId] == nil {
		// 没有流量的企业（已停用）只登记一笔开户充值
		topupTimes = topupTimes[len(topupTimes)-1:]
		topupTimes[0] = s.daysAgo(19)
	}
	recent := s.recentDailyQuota(userId, 7)
	for i, at := range topupTimes {
		next := s.now.Unix()
		if i+1 < len(topupTimes) {
			next = topupTimes[i+1]
		}
		need := float64(s.agg.userQuotaBetween(userId, startOfDay(time.Unix(at, 0).In(s.loc)).Unix(), next)) * 1.25
		if i == len(topupTimes)-1 {
			need += recent * 26
		}
		step := 100.0
		if need > float64(quotaOfUSD(2000)) {
			step = 500
		}
		amount := usd(roundUpUSD(math.Max(need, float64(quotaOfUSD(200))), step))
		topUp, err := model.RegisterManualTopUp(userId, s.rootId, common.RoleRootUser, int(quotaOfUSD(amount)), amount,
			model.PaymentMethodBankTransfer, fmt.Sprintf("DEMO-WIRE-%s-%d", demo.Key, i+1), "127.0.0.1")
		if err != nil {
			return err
		}
		if err := model.DB.Model(&model.TopUp{}).Where("id = ?", topUp.Id).Updates(map[string]any{"create_time": at, "complete_time": at}).Error; err != nil {
			return err
		}
		if err := model.DB.Model(&model.EnterpriseLedgerEntry{}).Where("enterprise_id = ? AND remark = ?", demo.Ent.Id, topUp.TradeNo).Update("created_at", at).Error; err != nil {
			return err
		}
		if err := model.LOG_DB.Model(&model.Log{}).Where("user_id = ? AND type = ? AND created_at >= ?", userId, model.LogTypeTopup, s.now.Unix()-600).
			Update("created_at", at).Error; err != nil {
			return err
		}
	}
	if s.agg.users[userId] != nil {
		entry, err := model.AdjustEnterpriseWallet(demo.Ent.Id, quotaOfUSD(50), s.rootId, "SLA 补偿：上游故障期间的失败请求")
		if err != nil {
			return err
		}
		if err := model.DB.Model(&model.EnterpriseLedgerEntry{}).Where("id = ?", entry.Id).Update("created_at", s.daysAgo(33)).Error; err != nil {
			return err
		}
	}

	// 钱包流水按时间重放：余额 = 之前所有入账 − 之前的消耗
	var entries []model.EnterpriseLedgerEntry
	if err := model.DB.Where("enterprise_id = ? AND (type = ? OR (type = ? AND ref_type = ?))", demo.Ent.Id,
		model.EnterpriseLedgerTopup, model.EnterpriseLedgerAdjustment, model.EnterpriseLedgerRefWallet).Order("created_at").Find(&entries).Error; err != nil {
		return err
	}
	balanceAt := func(at int64) int64 {
		var credited int64
		for _, entry := range entries {
			if entry.CreatedAt <= at {
				credited += entry.AmountQuota
			}
		}
		return credited - s.consumedBefore(userId, at)
	}
	for _, entry := range entries {
		if err := model.DB.Model(&model.EnterpriseLedgerEntry{}).Where("id = ?", entry.Id).Update("balance_after_quota", balanceAt(entry.CreatedAt)).Error; err != nil {
			return err
		}
	}

	// 月结单：每个已结束的自然月，先把余额拨回月末再生成（函数按当前余额倒推期初）
	monthStart := startOfDay(s.now.In(s.loc))
	monthStart = time.Date(monthStart.Year(), monthStart.Month(), 1, 0, 0, 0, 0, s.loc)
	for month := s.start.AddDate(0, 1, 0); !month.After(monthStart); month = month.AddDate(0, 1, 0) {
		if s.agg.users[userId] == nil {
			break
		}
		if err := model.DB.Model(&model.User{}).Where("id = ?", userId).Update("quota", balanceAt(month.Unix()-1)).Error; err != nil {
			return err
		}
		if err := s.generateStatementsFor(demo.Ent.Id, month.Unix()+6*3600); err != nil {
			return err
		}
	}
	return model.DB.Model(&model.User{}).Where("id = ?", userId).Update("quota", balanceAt(s.now.Unix())).Error
}

// consumedBefore 用户在 at 之前的消耗（按日聚合 + 当天按比例近似；只用于展示用的余额）
func (s *seeder) consumedBefore(userId int, at int64) int64 {
	dayStart := startOfDay(time.Unix(at, 0).In(s.loc)).Unix()
	sum := s.agg.userQuotaBetween(userId, 0, dayStart)
	today := s.agg.userDaily[userId][dayStart]
	return sum + today*(at-dayStart)/86400
}

// generateStatementsFor 生成月结单时只保留示例企业的那张：函数会顺带给其他预付企业补单，
// 那些不属于示例数据，立即删掉，保持真实企业的账单不被改动
func (s *seeder) generateStatementsFor(enterpriseId int, now int64) error {
	var maxBefore int64
	if err := model.DB.Model(&model.EnterpriseBill{}).Select("COALESCE(MAX(id), 0)").Scan(&maxBefore).Error; err != nil {
		return err
	}
	if _, err := model.GenerateMonthlyStatements(now); err != nil {
		return err
	}
	return model.DB.Where("id > ? AND enterprise_id <> ?", maxBefore, enterpriseId).Delete(&model.EnterpriseBill{}).Error
}

// seedBudgetsAndPolicies 团队预算按本月实际用量反推（让使用率落在设定档位），周期限额 key 按本周期用量定额度
func (s *seeder) seedBudgetsAndPolicies() error {
	local := s.now.In(s.loc)
	monthStart := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, s.loc)
	monthDay := monthStart.Format("2006-01-02")
	for _, demo := range s.enterprises {
		teamUsage := map[int]int64{}
		for _, row := range s.agg.entUsage {
			if row.EnterpriseId == demo.Ent.Id && row.Day >= monthDay {
				teamUsage[row.TeamId] += row.Quota
			}
		}
		for name, fill := range demo.BudgetFill {
			team := demo.Teams[name]
			used := teamUsage[team.Id]
			if used == 0 {
				continue
			}
			budget := roundUpUSD(float64(used)/fill, 10)
			if fill > 1 {
				// 超额档位向下取整，保证确实超了
				budget = quotaOfUSD(math.Floor(usd(int64(float64(used)/fill))/10) * 10)
			}
			if err := model.DB.Model(&model.EnterpriseTeam{}).Where("id = ?", team.Id).Update("monthly_budget_quota", budget).Error; err != nil {
				return err
			}
		}

		for _, policy := range demo.Policies {
			from := monthStart
			switch policy.Period {
			case model.TokenQuotaResetDaily:
				from = startOfDay(local)
			case model.TokenQuotaResetWeekly:
				from = startOfDay(local).AddDate(0, 0, -((int(local.Weekday()) + 6) % 7))
			}
			var used int64
			if err := model.LOG_DB.Model(&model.Log{}).Where("token_id = ? AND type = ? AND created_at >= ?", policy.TokenId, model.LogTypeConsume, from.Unix()).
				Select("COALESCE(SUM(quota), 0)").Scan(&used).Error; err != nil {
				return err
			}
			periodQuota := quotaOfUSD(20)
			if used > 0 {
				periodQuota = roundUpUSD(float64(used)/policy.Fill, 5)
			}
			status := common.TokenStatusEnabled
			if policy.Fill >= 1 {
				periodQuota = max(used, quotaOfUSD(5))
				status = common.TokenStatusExhausted
			}
			if err := model.DB.Create(&model.EnterpriseTokenQuotaPolicy{TokenId: policy.TokenId, EnterpriseId: demo.Ent.Id,
				ResetPeriod: policy.Period, PeriodQuota: periodQuota, NextResetAt: model.NextTokenQuotaResetAt(policy.Period, 0, s.now.Unix()),
				UpdatedAt: from.Unix()}).Error; err != nil {
				return err
			}
			if err := model.DB.Model(&model.Token{}).Where("id = ?", policy.TokenId).Updates(map[string]any{
				"unlimited_quota": false, "remain_quota": max(0, periodQuota-used), "status": status,
			}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}
