package controller

import (
	"errors"
	"math"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// 人工调账的两种对象
const (
	enterpriseAdjustmentKindWallet = "wallet"
	enterpriseAdjustmentKindBill   = "bill"
	// enterpriseAdjustmentMaxUSD 单笔调账金额绝对值上限（USD）
	enterpriseAdjustmentMaxUSD = 1e9
	// enterpriseAdjustmentMaxRemarkRunes 备注长度上限（按 rune 计）
	enterpriseAdjustmentMaxRemarkRunes = 1000
	// enterpriseAdjustVerificationAction 二次验证的动作名（service.adminUserManageActions 白名单）
	enterpriseAdjustVerificationAction = "enterprise_adjust"
)

type adminEnterpriseAdjustmentRequest struct {
	Kind      string  `json:"kind"`
	BillId    int64   `json:"bill_id"`
	AmountUSD float64 `json:"amount_usd"`
	Remark    string  `json:"remark"`
}

// adminEnterpriseAdjustmentResult 调账结果：钱包调账只有流水，账单调账附带调整后的账单
type adminEnterpriseAdjustmentResult struct {
	Kind   string                       `json:"kind"`
	Ledger *model.EnterpriseLedgerEntry `json:"ledger"`
	Bill   *model.EnterpriseBill        `json:"bill,omitempty"`
}

// AdminCreateEnterpriseAdjustment 管理员人工调账：预付企业余额或未结清的授信账单。
// 参数校验在二次验证之前，验证在任何余额 / 账单写入之前；每笔恰好一条 adjustment 流水 + 一条审计。
func AdminCreateEnterpriseAdjustment(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req adminEnterpriseAdjustmentRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if req.Kind != enterpriseAdjustmentKindWallet && req.Kind != enterpriseAdjustmentKindBill {
		common.ApiErrorMsg(c, "kind must be wallet or bill")
		return
	}
	if req.AmountUSD == 0 || math.IsNaN(req.AmountUSD) || math.IsInf(req.AmountUSD, 0) || math.Abs(req.AmountUSD) > enterpriseAdjustmentMaxUSD {
		common.ApiErrorMsg(c, "adjustment amount must be non-zero and within range")
		return
	}
	req.Remark = strings.TrimSpace(req.Remark)
	if remarkRunes := len([]rune(req.Remark)); remarkRunes < model.EnterpriseAdjustmentMinRemarkRunes || remarkRunes > enterpriseAdjustmentMaxRemarkRunes {
		common.ApiErrorMsg(c, model.ErrEnterpriseAdjustmentRemark.Error())
		return
	}
	amountUSD := decimal.NewFromFloat(req.AmountUSD).Round(6)
	// 现有 usdToQuota 拒绝负数，调账金额可负，直接走钱包换算
	amountQuota, err := common.WalletQuotaFromDecimalStrict(amountUSD.Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
	if err != nil || amountQuota == 0 {
		common.ApiErrorMsg(c, "adjustment amount is too small or out of range")
		return
	}
	enterprise, err := model.GetEnterpriseById(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "enterprise not found"})
			return
		}
		common.ApiError(c, err)
		return
	}
	var bill *model.EnterpriseBill
	if req.Kind == enterpriseAdjustmentKindBill {
		if req.BillId <= 0 {
			common.ApiErrorMsg(c, "bill_id is required")
			return
		}
		// 账单必须属于路径里的企业，否则按不存在处理，避免跨企业探测
		bill, err = model.GetEnterpriseBill(req.BillId)
		if err != nil || bill.EnterpriseId != enterprise.Id {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "bill not found"})
			return
		}
	}

	authorization := requireAdminUserProof(c, service.VerificationScopeAdminUserManage, service.AdminUserManageContext{UserID: enterprise.UserId, Action: enterpriseAdjustVerificationAction})
	if authorization == nil {
		return
	}

	result := adminEnterpriseAdjustmentResult{Kind: req.Kind}
	auditParams := map[string]any{
		"enterprise_id": enterprise.Id, "kind": req.Kind, "amount_usd": req.AmountUSD, "remark": req.Remark,
		"verification_method": authorization.Method,
	}
	action := "enterprise.adjustment.wallet"
	if req.Kind == enterpriseAdjustmentKindWallet {
		result.Ledger, err = model.AdjustEnterpriseWallet(enterprise.Id, int64(amountQuota), c.GetInt("id"), req.Remark)
	} else {
		action = "enterprise.adjustment.bill"
		auditParams["bill_id"], auditParams["bill_no"] = bill.Id, bill.BillNo
		result.Bill, result.Ledger, err = model.AdjustEnterpriseBill(bill.Id, amountUSD, c.GetInt("id"), req.Remark)
	}
	if err != nil {
		for _, businessErr := range []error{
			model.ErrEnterpriseNotPrepaid, model.ErrWalletQuotaLimitExceeded, model.ErrEnterpriseAdjustmentExceedsBalance,
			model.ErrEnterpriseAdjustmentRemark, model.ErrEnterpriseAdjustmentZero,
			model.ErrEnterpriseBillNotPayable, model.ErrEnterpriseBillAdjustmentBelowPaid,
		} {
			if errors.Is(err, businessErr) {
				common.ApiErrorMsg(c, err.Error())
				return
			}
		}
		enterpriseApiError(c, err)
		return
	}
	auditParams["ledger_id"] = result.Ledger.Id
	if result.Bill != nil {
		auditParams["status"] = result.Bill.Status
		auditParams["total_usd"] = result.Bill.TotalUSD.String()
	}
	recordManageAuditFor(c, enterprise.UserId, action, auditParams)
	common.ApiSuccess(c, result)
}
