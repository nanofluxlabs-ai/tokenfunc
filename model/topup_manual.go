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

var ErrManualTopUpPaymentMethod = errors.New("unsupported payment method")

func IsManualTopUpPaymentMethod(method string) bool {
	return slices.Contains(ManualTopUpPaymentMethods, method)
}

// RegisterManualTopUp 管理员手动充值：锁用户行、写成功充值单、加余额，三步同一事务。
// 企业主账号走同一入口：加余额改由 registerEnterpriseTopupTx 完成（预付模式校验 + 钱包上限 + 企业台账），
// 充值单 / 充值日志 / 审计与普通用户完全一致，订单中心与对账因此能看到企业充值；授信企业返回 ErrEnterpriseNotPrepaid。
func RegisterManualTopUp(userId int, operatorId int, operatorRole int, quota int, moneyUSD float64, paymentMethod string, reference string, callerIp string) (*TopUp, error) {
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
		var enterprise Enterprise
		err := tx.Select("id").Where("user_id = ?", userId).First(&enterprise).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if enterprise.Id > 0 {
			// 企业主：台账 remark 记订单号，台账与订单中心可互相对照
			if _, err := registerEnterpriseTopupTx(tx, enterprise.Id, quota, operatorId, reference, topUp.TradeNo); err != nil {
				return err
			}
			return tx.Create(topUp).Error
		}
		if err := tx.Create(topUp).Error; err != nil {
			return err
		}
		return creditTopUpQuota(tx, userId, quota, nil)
	})
	if err != nil {
		return nil, err
	}
	syncCreditUserQuotaCache(userId, quota, common.LogText("admin manual topup"))
	// 充值日志内容是前端翻译 key，译文在 web/src/i18n/locales/tokenfunc/<lang>.json
	RecordTopupLog(userId, common.NewMessage("Administrator manual top-up succeeded, quota added: {{quota}}, amount: ${{amount}}, payment method: {{method}}", map[string]any{"quota": logger.FormatQuota(quota), "amount": fmt.Sprintf("%.2f", moneyUSD), "method": paymentMethod}), callerIp, paymentMethod, PaymentProviderAdmin)
	return topUp, nil
}
