package controller

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

// 金额在接口层用 USD（小数）表达，内部换算成 quota 整数
func usdToQuota(usd float64) (int, error) {
	if usd < 0 {
		return 0, errors.New("amount cannot be negative")
	}
	return common.WalletQuotaFromDecimalStrict(decimal.NewFromFloat(usd).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
}

type adminEnterpriseCreditRequest struct {
	CycleType string  `json:"cycle_type"`
	CycleDays int     `json:"cycle_days"`
	LimitUSD  float64 `json:"limit_usd"`
}

// AdminConfigureEnterpriseCredit 开通/修改授信（额度立即生效，周期从下一期生效）
func AdminConfigureEnterpriseCredit(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req adminEnterpriseCreditRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	limitQuota, err := usdToQuota(req.LimitUSD)
	if err != nil {
		common.ApiErrorMsg(c, "invalid credit limit")
		return
	}
	config := model.EnterpriseCreditConfig{CycleType: req.CycleType, CycleDays: req.CycleDays, LimitQuota: int64(limitQuota)}
	if err := model.ConfigureEnterpriseCredit(id, config, c.GetInt("id")); err != nil {
		if errors.Is(err, model.ErrEnterpriseCreditConfig) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		enterpriseApiError(c, err)
		return
	}
	enterprise, _ := model.GetEnterpriseById(id)
	recordManageAuditFor(c, enterpriseOwnerId(enterprise), "enterprise.credit.configure", map[string]any{
		"enterprise_id": id, "cycle_type": req.CycleType, "cycle_days": req.CycleDays, "limit_usd": req.LimitUSD,
	})
	common.ApiSuccess(c, nil)
}

// AdminSwitchEnterprisePrepaid 授信切回预付
func AdminSwitchEnterprisePrepaid(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	if err := model.SwitchEnterpriseToPrepaid(id, c.GetInt("id")); err != nil {
		enterpriseApiError(c, err)
		return
	}
	enterprise, _ := model.GetEnterpriseById(id)
	recordManageAuditFor(c, enterpriseOwnerId(enterprise), "enterprise.credit.disable", map[string]any{"enterprise_id": id})
	common.ApiSuccess(c, nil)
}

type adminEnterpriseStatusRequest struct {
	Status string `json:"status"`
}

func AdminSetEnterpriseStatus(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req adminEnterpriseStatusRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := model.SetEnterpriseStatus(id, req.Status); err != nil {
		enterpriseApiError(c, err)
		return
	}
	enterprise, _ := model.GetEnterpriseById(id)
	recordManageAuditFor(c, enterpriseOwnerId(enterprise), "enterprise.status", map[string]any{"enterprise_id": id, "status": req.Status})
	common.ApiSuccess(c, nil)
}

type adminEnterpriseTopupRequest struct {
	AmountUSD float64 `json:"amount_usd"`
	Reference string  `json:"reference"`
	Remark    string  `json:"remark"`
}

// AdminRegisterEnterpriseTopup 预付企业登记线下转账充值
func AdminRegisterEnterpriseTopup(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req adminEnterpriseTopupRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	amount, err := usdToQuota(req.AmountUSD)
	if err != nil || amount <= 0 {
		common.ApiErrorMsg(c, "top-up amount must be positive")
		return
	}
	if len(req.Reference) > 128 {
		common.ApiErrorMsg(c, "reference is too long")
		return
	}
	entry, err := model.RegisterEnterpriseTopup(id, amount, c.GetInt("id"), req.Reference, req.Remark)
	if err != nil {
		if errors.Is(err, model.ErrEnterpriseNotPrepaid) || errors.Is(err, model.ErrWalletQuotaLimitExceeded) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		enterpriseApiError(c, err)
		return
	}
	enterprise, _ := model.GetEnterpriseById(id)
	recordManageAuditFor(c, enterpriseOwnerId(enterprise), "enterprise.topup", map[string]any{
		"enterprise_id": id, "amount_usd": req.AmountUSD, "reference": req.Reference, "ledger_id": entry.Id,
	})
	common.ApiSuccess(c, entry)
}

func enterpriseOwnerId(enterprise *model.Enterprise) int {
	if enterprise == nil {
		return 0
	}
	return enterprise.UserId
}

func AdminListEnterpriseLedger(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	writeEnterpriseLedger(c, id)
}

func AdminListEnterpriseCreditPeriods(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	writeEnterpriseCreditPeriods(c, id)
}

// ---------------------------------------------------------------------------
// 企业控制台
// ---------------------------------------------------------------------------

type enterpriseOverview struct {
	Enterprise   *model.Enterprise             `json:"enterprise"`
	BalanceQuota int                           `json:"balance_quota"`
	OpenPeriod   *model.EnterpriseCreditPeriod `json:"open_period"`
}

// GetEnterpriseOverview 概览：预付显示余额，授信显示当前账期的额度/已用；团队角色看不到财务字段
func GetEnterpriseOverview(c *gin.Context) {
	enterprise := currentEnterprise(c)
	overview := enterpriseOverview{Enterprise: enterprise}
	if !currentActor(c).AtLeast(model.EnterpriseMemberRoleEnterpriseAdmin) {
		common.ApiSuccess(c, overview)
		return
	}
	if enterprise.BillingMode == model.EnterpriseBillingModeCredit {
		period, err := model.GetOpenCreditPeriod(enterprise.Id)
		if err != nil && !errors.Is(err, model.ErrEnterpriseCreditNoOpenPeriod) {
			common.ApiError(c, err)
			return
		}
		overview.OpenPeriod = period
	} else {
		balance, err := model.GetUserQuota(enterprise.UserId, true)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		overview.BalanceQuota = balance
	}
	common.ApiSuccess(c, overview)
}

func ListEnterpriseLedgerSelf(c *gin.Context) {
	writeEnterpriseLedger(c, currentEnterprise(c).Id)
}

func ListEnterpriseCreditPeriodsSelf(c *gin.Context) {
	writeEnterpriseCreditPeriods(c, currentEnterprise(c).Id)
}

func writeEnterpriseLedger(c *gin.Context, enterpriseId int) {
	pageInfo := common.GetPageQuery(c)
	entries, total, err := model.ListEnterpriseLedger(enterpriseId, c.Query("type"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(entries)
	common.ApiSuccess(c, pageInfo)
}

func writeEnterpriseCreditPeriods(c *gin.Context, enterpriseId int) {
	pageInfo := common.GetPageQuery(c)
	periods, total, err := model.ListEnterpriseCreditPeriods(enterpriseId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(periods)
	common.ApiSuccess(c, pageInfo)
}
