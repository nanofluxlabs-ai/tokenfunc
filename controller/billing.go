package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

// 授信额度查询接口的业务错误码（OpenAI error 格式的 code 字段）
const (
	billingErrorCodeCreditNotEnabled     = "enterprise_credit_not_enabled"
	billingErrorCodeCreditPeriodNotFound = "credit_period_not_found"
)

// quotaDisplayAmount 把内部额度换算成站点展示单位。OpenAI 兼容接口中的 *_USD 字段含义保持"额度单位"对应值：
// - USD: 直接除以 QuotaPerUnit
// - CNY: 先转 USD 再乘汇率
// - TOKENS: 直接使用 tokens 数量
func quotaDisplayAmount(quota int64) float64 {
	amount := float64(quota)
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		return amount / common.QuotaPerUnit * operation_setting.USDExchangeRate
	case operation_setting.QuotaDisplayTypeTokens:
		return amount
	default:
		return amount / common.QuotaPerUnit
	}
}

func writeBillingError(c *gin.Context, status int, code string, message string) {
	c.JSON(status, gin.H{
		"error": types.OpenAIError{Message: message, Type: "new_api_error", Code: code},
	})
}

// resolveCreditSnapshot 判定当前 API key 能否读取企业授信额度。
// 返回 nil, false 表示非企业用户或预付企业，调用方走各自的原有逻辑；
// handled=true 表示已写出错误响应（企业停用、员工 key、数据库错误）。
func resolveCreditSnapshot(c *gin.Context) (snapshot *model.EnterpriseCreditSnapshot, handled bool) {
	snapshot, err := model.GetEnterpriseCreditSnapshot(c.GetInt("id"))
	if errors.Is(err, model.ErrEnterpriseNotCredit) {
		return nil, false
	}
	if err != nil {
		writeBillingError(c, http.StatusInternalServerError, string(types.ErrorCodeQueryDataError), err.Error())
		return nil, true
	}
	if snapshot == nil {
		return nil, false
	}
	// 与 relay 入口 enterpriseBillingGate 一致：停用的企业既不能用 key 请求，也不该看到"额度充足"
	if snapshot.Enterprise.Status != model.EnterpriseStatusActive {
		writeBillingError(c, http.StatusForbidden, string(types.ErrorCodeInsufficientUserQuota), "enterprise account is suspended")
		return nil, true
	}
	// 授信是企业级额度，只允许主账号自建的 key 查询，分配给员工的 key 一律拒绝
	isEmployeeToken, err := model.IsEnterpriseEmployeeToken(c.GetInt("token_id"))
	if err != nil {
		writeBillingError(c, http.StatusInternalServerError, string(types.ErrorCodeQueryDataError), err.Error())
		return nil, true
	}
	if isEmployeeToken {
		writeBillingError(c, http.StatusForbidden, string(types.ErrorCodeAccessDenied), "employee API keys cannot query enterprise credit")
		return nil, true
	}
	return snapshot, false
}

func GetSubscription(c *gin.Context) {
	snapshot, handled := resolveCreditSnapshot(c)
	if handled {
		return
	}
	if snapshot != nil {
		// 授信企业：额度上限 = 当前账期额度，access_until = 账期结束；账期滚动空窗时返回 0，不退回钱包数值
		subscription := OpenAISubscriptionResponse{Object: "billing_subscription", HasPaymentMethod: true}
		if snapshot.Period != nil {
			amount := quotaDisplayAmount(snapshot.Period.LimitQuota)
			subscription.SoftLimitUSD = amount
			subscription.HardLimitUSD = amount
			subscription.SystemHardLimitUSD = amount
			subscription.AccessUntil = snapshot.Period.EndAt
		}
		c.JSON(http.StatusOK, subscription)
		return
	}

	var remainQuota int
	var usedQuota int
	var err error
	var token *model.Token
	var expiredTime int64
	if common.DisplayTokenStatEnabled {
		tokenId := c.GetInt("token_id")
		token, err = model.GetTokenById(tokenId)
		expiredTime = token.ExpiredTime
		remainQuota = token.RemainQuota
		usedQuota = token.UsedQuota
	} else {
		userId := c.GetInt("id")
		remainQuota, err = model.GetUserQuota(userId, false)
		usedQuota, err = model.GetUserUsedQuota(userId)
	}
	if expiredTime <= 0 {
		expiredTime = 0
	}
	if err != nil {
		openAIError := types.OpenAIError{
			Message: err.Error(),
			Type:    "upstream_error",
		}
		c.JSON(200, gin.H{
			"error": openAIError,
		})
		return
	}
	quota := remainQuota + usedQuota
	amount := quotaDisplayAmount(int64(quota))
	if token != nil && token.UnlimitedQuota {
		amount = 100000000
	}
	subscription := OpenAISubscriptionResponse{
		Object:             "billing_subscription",
		HasPaymentMethod:   true,
		SoftLimitUSD:       amount,
		HardLimitUSD:       amount,
		SystemHardLimitUSD: amount,
		AccessUntil:        expiredTime,
	}
	c.JSON(200, subscription)
	return
}

func GetUsage(c *gin.Context) {
	snapshot, handled := resolveCreditSnapshot(c)
	if handled {
		return
	}
	if snapshot != nil {
		// 授信企业：用量 = 当前账期已用（忽略 start_date / end_date），不是主账号累计用量
		usage := OpenAIUsageResponse{Object: "list"}
		if snapshot.Period != nil {
			usage.TotalUsage = quotaDisplayAmount(snapshot.Period.UsedQuota) * 100
		}
		c.JSON(http.StatusOK, usage)
		return
	}

	var quota int
	var err error
	var token *model.Token
	if common.DisplayTokenStatEnabled {
		tokenId := c.GetInt("token_id")
		token, err = model.GetTokenById(tokenId)
		quota = token.UsedQuota
	} else {
		userId := c.GetInt("id")
		quota, err = model.GetUserUsedQuota(userId)
	}
	if err != nil {
		openAIError := types.OpenAIError{
			Message: err.Error(),
			Type:    "new_api_error",
		}
		c.JSON(200, gin.H{
			"error": openAIError,
		})
		return
	}
	usage := OpenAIUsageResponse{
		Object:     "list",
		TotalUsage: quotaDisplayAmount(int64(quota)) * 100,
	}
	c.JSON(200, usage)
	return
}

// CreditBillingResponse 授信额度查询响应：*_quota 为内部额度原值，limit / used / available 为站点展示单位换算值
type CreditBillingResponse struct {
	Object           string  `json:"object"`
	BillingMode      string  `json:"billing_mode"`
	CreditCycleType  string  `json:"credit_cycle_type"`
	PeriodNo         int     `json:"period_no"`
	PeriodStart      int64   `json:"period_start"`
	PeriodEnd        int64   `json:"period_end"`
	LimitQuota       int64   `json:"limit_quota"`
	UsedQuota        int64   `json:"used_quota"`
	AvailableQuota   int64   `json:"available_quota"`
	Limit            float64 `json:"limit"`
	Used             float64 `json:"used"`
	Available        float64 `json:"available"`
	QuotaDisplayType string  `json:"quota_display_type"`
	Currency         string  `json:"currency"`
}

// GetCreditBilling 授信企业用主账号 API key 查询当前账期额度（TokenFunc 二开）
func GetCreditBilling(c *gin.Context) {
	snapshot, handled := resolveCreditSnapshot(c)
	if handled {
		return
	}
	if snapshot == nil {
		writeBillingError(c, http.StatusForbidden, billingErrorCodeCreditNotEnabled, "credit billing is not enabled for this account")
		return
	}
	if snapshot.Period == nil {
		writeBillingError(c, http.StatusNotFound, billingErrorCodeCreditPeriodNotFound, "no open credit period")
		return
	}
	period := snapshot.Period
	// 出账后到达的结算差额会无条件累加，已用可能超过额度，可用额度钳位到 0
	availableQuota := max(period.LimitQuota-period.UsedQuota, 0)
	c.JSON(http.StatusOK, CreditBillingResponse{
		Object:           "billing_credit",
		BillingMode:      snapshot.Enterprise.BillingMode,
		CreditCycleType:  snapshot.Enterprise.CreditCycleType,
		PeriodNo:         period.PeriodNo,
		PeriodStart:      period.StartAt,
		PeriodEnd:        period.EndAt,
		LimitQuota:       period.LimitQuota,
		UsedQuota:        period.UsedQuota,
		AvailableQuota:   availableQuota,
		Limit:            quotaDisplayAmount(period.LimitQuota),
		Used:             quotaDisplayAmount(period.UsedQuota),
		Available:        quotaDisplayAmount(availableQuota),
		QuotaDisplayType: operation_setting.GetQuotaDisplayType(),
		Currency:         snapshot.Enterprise.Currency,
	})
}
