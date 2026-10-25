package service

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

// BillingSourceCredit 企业授信资金来源标识
const BillingSourceCredit = "credit"

var (
	// ErrInsufficientCreditQuota 本期授信额度已用完（原子预扣未命中），未发生任何扣减
	ErrInsufficientCreditQuota = errors.New("enterprise credit limit reached")
	errEnterpriseSuspended     = errors.New("enterprise account is suspended")
)

// CreditFunding 企业授信资金来源：在当前账期额度内预扣，结算差额与退款都记回同一账期
type CreditFunding struct {
	enterpriseId int
	periodId     int64 // 预扣时确定，之后不变
	consumed     int   // 本次预扣额度
	reserved     bool  // 预扣已成功（在途计数 +1），结算或退款必须把它减回去
}

func (f *CreditFunding) Source() string { return BillingSourceCredit }

// PreConsume 在 open 期上原子预扣；缓存里的账期可能已滚动，未命中时刷新一次再试
func (f *CreditFunding) PreConsume(amount int) error {
	if amount < 0 {
		return fmt.Errorf("credit pre-consume amount cannot be negative: %d", amount)
	}
	for attempt := range 2 {
		if f.periodId == 0 || attempt == 1 {
			period, err := model.EnsureOpenCreditPeriod(f.enterpriseId)
			if err != nil {
				return err
			}
			f.periodId = period.Id
		}
		ok, err := model.AddCreditUsage(f.periodId, int64(amount), 1, true)
		if err != nil {
			return err
		}
		if ok {
			f.consumed = amount
			f.reserved = true
			return nil
		}
		// 未命中：要么额度不足，要么账期已滚动；用最新 open 期再判断一次
		period, err := model.GetOpenCreditPeriod(f.enterpriseId)
		if err != nil && !errors.Is(err, model.ErrEnterpriseCreditNoOpenPeriod) {
			return err
		}
		if err == nil && period.Id == f.periodId {
			return ErrInsufficientCreditQuota
		}
	}
	return ErrInsufficientCreditQuota
}

func (f *CreditFunding) Settle(delta int) error {
	inflight := 0
	if f.reserved {
		inflight = -1
		f.reserved = false
	}
	return model.ApplyCreditSettlement(f.enterpriseId, f.periodId, int64(delta), inflight)
}

// Finish 结算差额为 0 时也要释放在途计数（BillingSession.Settle 在 delta=0 时不会调 Settle）
func (f *CreditFunding) Finish() error {
	if !f.reserved {
		return nil
	}
	return f.Settle(0)
}

func (f *CreditFunding) Refund() error {
	if !f.reserved {
		return nil
	}
	f.reserved = false
	_, err := model.AddCreditUsage(f.periodId, -int64(f.consumed), -1, false)
	return err
}

// reserveExtra 发送前补充预扣：图片类请求数量已知，必须在额度内；其他请求与钱包一致，无条件累加（允许超额，不中断请求）
func (f *CreditFunding) reserveExtra(delta int, requireAvailableQuota bool) error {
	ok, err := model.AddCreditUsage(f.periodId, int64(delta), 0, requireAvailableQuota)
	if err != nil {
		return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
	}
	if !ok {
		if requireAvailableQuota {
			return types.NewErrorWithStatusCode(ErrInsufficientCreditQuota, types.ErrorCodeInsufficientUserQuota, http.StatusForbidden, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
		}
		// 账期已不在 open/closing（极少见：出账后仍在途），按跨期调整处理
		if err := model.ApplyCreditSettlement(f.enterpriseId, f.periodId, int64(delta), 0); err != nil {
			return types.NewError(err, types.ErrorCodeUpdateDataError, types.ErrOptionWithSkipRetry())
		}
	}
	f.consumed += delta
	return nil
}

func (f *CreditFunding) rollbackExtra(delta int) {
	if _, err := model.AddCreditUsage(f.periodId, -int64(delta), 0, false); err != nil {
		common.SysLog("error rolling back credit funding reserve: " + err.Error())
	} else {
		f.consumed -= delta
	}
}

// enterpriseBillingGate 计费入口的企业判定：停用的企业直接拒绝；授信企业返回授信会话；预付企业走钱包
func enterpriseBillingGate(c *gin.Context, relayInfo *relaycommon.RelayInfo, preConsumedQuota int) (*BillingSession, bool, *types.NewAPIError) {
	info, err := model.GetEnterpriseBillingInfo(relayInfo.UserId)
	if err != nil {
		return nil, false, types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
	}
	if info == nil {
		return nil, false, nil
	}
	if info.Status != model.EnterpriseStatusActive {
		return nil, true, types.NewErrorWithStatusCode(errEnterpriseSuspended, types.ErrorCodeInsufficientUserQuota, http.StatusForbidden, types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
	}
	// 团队预算拦截在任何资金源预扣之前，预付与授信企业都适用
	if apiErr := checkTeamBudgetGate(c, info, relayInfo.TokenId, preConsumedQuota); apiErr != nil {
		return nil, true, apiErr
	}
	if info.BillingMode != model.EnterpriseBillingModeCredit {
		return nil, false, nil
	}
	funding := &CreditFunding{enterpriseId: info.EnterpriseId, periodId: info.OpenPeriodId}
	session := &BillingSession{relayInfo: relayInfo, funding: funding}
	if apiErr := session.preConsume(c, preConsumedQuota); apiErr != nil {
		return nil, true, apiErr
	}
	relayInfo.CreditPeriodId = funding.periodId
	c.Set(model.ContextKeyEnterpriseCreditPeriod, funding.periodId)
	return session, true, nil
}
