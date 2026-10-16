package model

import (
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"gorm.io/gorm"
)

// TokenFunc 二开：管理员手动充值。与在线充值共用 top_ups，provider 固定为 admin，
// payment_method 记录实际收款方式，Amount 存额度、Money 存美元（与 Creem 同一语义）。

// ManualTopUpPaymentMethods 管理员手动充值允许登记的收款方式
var ManualTopUpPaymentMethods = []string{PaymentMethodBankTransfer, PaymentMethodAlipay, PaymentMethodWxpay, PaymentMethodGift}

var (
	ErrManualTopUpEnterpriseOwner = errors.New("enterprise accounts must be topped up from the enterprise ledger")
	ErrManualTopUpPaymentMethod   = errors.New("unsupported payment method")
)

func IsManualTopUpPaymentMethod(method string) bool {
	return slices.Contains(ManualTopUpPaymentMethods, method)
}

// RegisterManualTopUp 管理员手动充值：锁用户行、写成功充值单、加余额，三步同一事务；
// 企业主账号的充值走企业台账（RegisterEnterpriseTopup），这里拒绝。
func RegisterManualTopUp(userId int, operatorRole int, quota int, moneyUSD float64, paymentMethod string, reference string, callerIp string) (*TopUp, error) {
	if userId <= 0 || quota <= 0 || moneyUSD <= 0 {
		return nil, ErrInvalidTopUpQuota
	}
	if !IsManualTopUpPaymentMethod(paymentMethod) {
		return nil, ErrManualTopUpPaymentMethod
	}
	now := time.Now().Unix()
	topUp := &TopUp{
		UserId:          userId,
		Amount:          int64(quota),
		Money:           moneyUSD,
		TradeNo:         fmt.Sprintf("ADMIN%d%s", now, common.GetRandomString(6)),
		PaymentMethod:   paymentMethod,
		PaymentProvider: PaymentProviderAdmin,
		Reference:       reference,
		CreateTime:      now,
		CompleteTime:    now,
		Status:          common.TopUpStatusSuccess,
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, userId).Error; err != nil {
			return err
		}
		if operatorRole != common.RoleRootUser && operatorRole <= user.Role {
			return ErrUserQuotaPermission
		}
		var enterprises int64
		if err := tx.Model(&Enterprise{}).Where("user_id = ?", userId).Count(&enterprises).Error; err != nil {
			return err
		}
		if enterprises > 0 {
			return ErrManualTopUpEnterpriseOwner
		}
		if err := tx.Create(topUp).Error; err != nil {
			return err
		}
		return creditTopUpQuota(tx, userId, quota, nil)
	})
	if err != nil {
		return nil, err
	}
	syncCreditUserQuotaCache(userId, quota, "admin manual topup")
	RecordTopupLog(userId, fmt.Sprintf("管理员手动充值成功，充值额度: %v，金额: $%.2f，收款方式: %s", logger.FormatQuota(quota), moneyUSD, paymentMethod), callerIp, paymentMethod, PaymentProviderAdmin)
	return topUp, nil
}
