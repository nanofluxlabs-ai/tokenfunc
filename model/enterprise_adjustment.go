package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// 人工调账（TokenFunc 二开，PG-only）：只走 ent_ledger.adjustment 流水，不碰预扣 / 结算链路。
//   - 钱包调账：预付企业主账号 users.quota 直接加减，流水 ref_type = wallet
//   - 账单调账：授信账单未结清时改 adjustment_usd 并重算 total_usd，流水 ref_type = bill
// 作废账单（VoidBill）也写 adjustment 类型、ref_type = bill；按余额口径汇总时只认 ref_type = wallet。

const (
	EnterpriseLedgerRefWallet = "wallet"
	EnterpriseLedgerRefBill   = "bill"
)

var (
	ErrEnterpriseAdjustmentRemark         = errors.New("a remark of at least 4 characters is required for an adjustment")
	ErrEnterpriseAdjustmentZero           = errors.New("adjustment amount cannot be zero")
	ErrEnterpriseAdjustmentExceedsBalance = errors.New("adjustment exceeds the current balance")
	ErrEnterpriseBillAdjustmentBelowPaid  = errors.New("adjusted total cannot be below the amount already paid")
)

// EnterpriseAdjustmentMinRemarkRunes 调账备注的最少字数（按 rune 计）
const EnterpriseAdjustmentMinRemarkRunes = 4

func validateEnterpriseAdjustmentRemark(remark string) (string, error) {
	remark = strings.TrimSpace(remark)
	if len([]rune(remark)) < EnterpriseAdjustmentMinRemarkRunes {
		return "", ErrEnterpriseAdjustmentRemark
	}
	return remark, nil
}

// AdjustEnterpriseWallet 预付企业余额人工调整：deltaQuota 正负皆可，扣减不能让余额为负；同一事务写 adjustment 流水
func AdjustEnterpriseWallet(enterpriseId int, deltaQuota int64, operatorId int, remark string) (*EnterpriseLedgerEntry, error) {
	remark, err := validateEnterpriseAdjustmentRemark(remark)
	if err != nil {
		return nil, err
	}
	if deltaQuota == 0 {
		return nil, ErrEnterpriseAdjustmentZero
	}
	if deltaQuota > common.MaxWalletQuota || deltaQuota < -common.MaxWalletQuota {
		return nil, ErrWalletQuotaLimitExceeded
	}
	entry := &EnterpriseLedgerEntry{
		EnterpriseId: enterpriseId,
		Type:         EnterpriseLedgerAdjustment,
		AmountQuota:  deltaQuota,
		RefType:      EnterpriseLedgerRefWallet,
		OperatorId:   operatorId,
		Remark:       remark,
	}
	var userId int
	err = DB.Transaction(func(tx *gorm.DB) error {
		enterprise, err := lockEnterprise(tx, enterpriseId)
		if err != nil {
			return err
		}
		if enterprise.BillingMode != EnterpriseBillingModePrepaid {
			return ErrEnterpriseNotPrepaid
		}
		userId = enterprise.UserId
		// 正数：不能越过钱包上限；负数：不能把余额扣成负数。条件放在 WHERE 里，靠影响行数判断，避免读改写竞态
		query := tx.Model(&User{}).Where("id = ?", userId)
		if deltaQuota > 0 {
			query = query.Where("quota <= ?", common.MaxWalletQuota-deltaQuota)
		} else {
			query = query.Where("quota + ? >= 0", deltaQuota)
		}
		result := query.Update("quota", gorm.Expr("quota + ?", deltaQuota))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			if deltaQuota > 0 {
				return ErrWalletQuotaLimitExceeded
			}
			return ErrEnterpriseAdjustmentExceedsBalance
		}
		var balance int64
		if err := tx.Model(&User{}).Where("id = ?", userId).Select("quota").Scan(&balance).Error; err != nil {
			return err
		}
		entry.BalanceAfterQuota = balance
		return recordEnterpriseLedger(tx, entry)
	})
	if err != nil {
		return nil, err
	}
	// 事务已提交，把增量同步进余额缓存（与线下充值同一做法）
	if cacheErr := cacheIncrUserQuota(userId, deltaQuota); cacheErr != nil {
		common.SysLog("failed to sync enterprise adjustment to user quota cache: " + cacheErr.Error())
	}
	return entry, nil
}

// AdjustEnterpriseBill 授信账单人工调整：amountUSD 累加到 adjustment_usd 并重算 total_usd 与状态。
// 只接受未结清的授信账单；调整后 total 不能低于已付金额、不能为负。
func AdjustEnterpriseBill(billId int64, amountUSD decimal.Decimal, operatorId int, remark string) (*EnterpriseBill, *EnterpriseLedgerEntry, error) {
	remark, err := validateEnterpriseAdjustmentRemark(remark)
	if err != nil {
		return nil, nil, err
	}
	amountUSD = amountUSD.Round(6)
	if amountUSD.IsZero() {
		return nil, nil, ErrEnterpriseAdjustmentZero
	}
	amountQuota, err := common.WalletQuotaFromDecimalStrict(amountUSD.Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	if err != nil {
		return nil, nil, err
	}
	var bill EnterpriseBill
	var entry *EnterpriseLedgerEntry
	reopened := false
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&bill, "id = ?", billId).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrEnterpriseResourceNotFound
			}
			return err
		}
		if bill.BillType != EnterpriseBillTypeCredit || (bill.Status != EnterpriseBillUnpaid && bill.Status != EnterpriseBillPartiallyPaid) {
			return ErrEnterpriseBillNotPayable
		}
		newAdjustment := bill.AdjustmentUSD.Add(amountUSD)
		newTotal := bill.AmountUSD.Add(newAdjustment)
		if newTotal.IsNegative() || newTotal.LessThan(bill.PaidUSD) {
			return ErrEnterpriseBillAdjustmentBelowPaid
		}
		now := common.GetTimestamp()
		bill.AdjustmentUSD, bill.TotalUSD, bill.UpdatedAt = newAdjustment, newTotal, now
		// 状态跟着新总额走（上面已保证 newTotal ≥ paid）：已付恰好等于新总额即结清（含调到 0 的账单，与出账时零金额即 paid 一致）；
		// 有部分付款保持部分付款；否则未付
		switch {
		case bill.PaidUSD.Equal(newTotal):
			bill.Status = EnterpriseBillPaid
			bill.PaidAt = now
		case bill.PaidUSD.IsPositive():
			bill.Status = EnterpriseBillPartiallyPaid
		default:
			bill.Status = EnterpriseBillUnpaid
		}
		updates := map[string]any{"adjustment_usd": newAdjustment, "total_usd": newTotal, "status": bill.Status, "updated_at": now}
		if bill.Status == EnterpriseBillPaid {
			updates["paid_at"] = now
		}
		if err := tx.Model(&EnterpriseBill{}).Where("id = ?", bill.Id).Updates(updates).Error; err != nil {
			return err
		}
		entry = &EnterpriseLedgerEntry{
			EnterpriseId: bill.EnterpriseId,
			Type:         EnterpriseLedgerAdjustment,
			AmountQuota:  int64(amountQuota),
			RefType:      EnterpriseLedgerRefBill,
			RefId:        bill.Id,
			OperatorId:   operatorId,
			Reference:    bill.BillNo,
			Remark:       remark,
		}
		if err := recordEnterpriseLedger(tx, entry); err != nil {
			return err
		}
		if bill.Status != EnterpriseBillPaid {
			return nil
		}
		// 调到恰好等于已付即结清：与收款结清同语义，额度信用待收款的企业随之开下一期恢复服务
		reopened, err = reopenCreditPeriodAfterBillSettledTx(tx, bill.EnterpriseId, now, operatorId)
		return err
	})
	if err != nil {
		return nil, nil, err
	}
	if reopened {
		InvalidateEnterpriseBillingInfoByEnterprise(bill.EnterpriseId)
	}
	return &bill, entry, nil
}
