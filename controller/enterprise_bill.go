package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

func paramBillId(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "invalid bill id")
		return 0, false
	}
	return id, true
}

func writeEnterpriseBills(c *gin.Context, enterpriseId int) {
	pageInfo := common.GetPageQuery(c)
	filter := model.EnterpriseBillFilter{
		EnterpriseId:      enterpriseId,
		BillType:          c.Query("bill_type"),
		Status:            c.Query("status"),
		OverdueOnly:       c.Query("overdue") == "true",
		ReconcileDiffOnly: c.Query("reconcile") == "diff",
	}
	if filter.EnterpriseId == 0 {
		if id, err := strconv.Atoi(c.Query("enterprise_id")); err == nil && id > 0 {
			filter.EnterpriseId = id
		}
	}
	bills, total, err := model.ListEnterpriseBills(filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(bills)
	common.ApiSuccess(c, pageInfo)
}

// ---------------------------------------------------------------------------
// 管理员
// ---------------------------------------------------------------------------

func AdminListEnterpriseBills(c *gin.Context) {
	writeEnterpriseBills(c, 0)
}

func AdminGetEnterpriseBill(c *gin.Context) {
	id, ok := paramBillId(c)
	if !ok {
		return
	}
	bill, err := model.GetEnterpriseBill(id)
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, bill)
}

type adminBillPaymentRequest struct {
	AmountUSD float64 `json:"amount_usd"`
	Reference string  `json:"reference"`
	Remark    string  `json:"remark"`
}

func AdminRegisterBillPayment(c *gin.Context) {
	id, ok := paramBillId(c)
	if !ok {
		return
	}
	var req adminBillPaymentRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if len(req.Reference) > 128 {
		common.ApiErrorMsg(c, "reference is too long")
		return
	}
	bill, err := model.RegisterBillPayment(id, decimal.NewFromFloat(req.AmountUSD).Round(6), c.GetInt("id"), req.Reference, req.Remark)
	if err != nil {
		if errors.Is(err, model.ErrEnterpriseBillNotPayable) || errors.Is(err, model.ErrEnterpriseBillOverpaid) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		enterpriseApiError(c, err)
		return
	}
	enterprise, _ := model.GetEnterpriseById(bill.EnterpriseId)
	recordManageAuditFor(c, enterpriseOwnerId(enterprise), "enterprise.bill.payment", map[string]any{
		"bill_id": bill.Id, "bill_no": bill.BillNo, "amount_usd": req.AmountUSD, "reference": req.Reference, "status": bill.Status,
	})
	common.ApiSuccess(c, bill)
}

type adminBillVoidRequest struct {
	Remark string `json:"remark"`
}

func AdminVoidEnterpriseBill(c *gin.Context) {
	id, ok := paramBillId(c)
	if !ok {
		return
	}
	var req adminBillVoidRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := model.VoidBill(id, c.GetInt("id"), req.Remark); err != nil {
		if errors.Is(err, model.ErrEnterpriseBillNotPayable) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		enterpriseApiError(c, err)
		return
	}
	bill, _ := model.GetEnterpriseBill(id)
	ownerId := 0
	if bill != nil {
		if enterprise, err := model.GetEnterpriseById(bill.EnterpriseId); err == nil {
			ownerId = enterprise.UserId
		}
	}
	recordManageAuditFor(c, ownerId, "enterprise.bill.void", map[string]any{"bill_id": id, "remark": req.Remark})
	common.ApiSuccess(c, nil)
}

// AdminIssueBillNow 管理员手动对 closing 账期立即出账（不等在途请求清零）
func AdminIssueBillNow(c *gin.Context) {
	periodId, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || periodId <= 0 {
		common.ApiErrorMsg(c, "invalid period id")
		return
	}
	bill, err := service.IssueCreditBillAndNotify(periodId)
	if err != nil {
		if errors.Is(err, model.ErrEnterprisePeriodNotReady) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		enterpriseApiError(c, err)
		return
	}
	service.ArchiveBillAsync(bill)
	common.ApiSuccess(c, bill)
}

// AdminListReconcileAlerts 对账差异列表：出账时计数器与明细不一致的授信账单（state=pending|acked|all）
func AdminListReconcileAlerts(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	enterpriseId, _ := strconv.Atoi(c.Query("enterprise_id"))
	alerts, total, err := model.ListReconcileAlerts(c.DefaultQuery("state", model.ReconcileAlertStatePending), enterpriseId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		if errors.Is(err, model.ErrReconcileAlertState) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(alerts)
	common.ApiSuccess(c, pageInfo)
}

type adminReconcileAckRequest struct {
	Note string `json:"note"`
}

// AdminAckReconcileAlert 标记对账差异已人工核对（幂等）
func AdminAckReconcileAlert(c *gin.Context) {
	billId, err := strconv.ParseInt(c.Param("bill_id"), 10, 64)
	if err != nil || billId <= 0 {
		common.ApiErrorMsg(c, "invalid bill id")
		return
	}
	var req adminReconcileAckRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if len(req.Note) > 1000 {
		common.ApiErrorMsg(c, "note is too long")
		return
	}
	bill, err := model.AckReconcileAlert(billId, c.GetInt("id"), req.Note)
	if err != nil {
		if errors.Is(err, model.ErrEnterpriseBillNoReconcileDiff) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		enterpriseApiError(c, err)
		return
	}
	enterprise, _ := model.GetEnterpriseById(bill.EnterpriseId)
	recordManageAuditFor(c, enterpriseOwnerId(enterprise), "enterprise.reconcile.ack", map[string]any{
		"bill_id": bill.Id, "bill_no": bill.BillNo, "reconcile_diff_quota": bill.ReconcileDiffQuota, "note": req.Note,
	})
	common.ApiSuccess(c, bill)
}

func AdminGetSellerProfile(c *gin.Context) {
	common.ApiSuccess(c, model.GetEnterpriseSellerProfile())
}

func AdminUpdateSellerProfile(c *gin.Context) {
	var profile model.EnterpriseSellerProfile
	if err := common.DecodeJson(c.Request.Body, &profile); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := model.SaveEnterpriseSellerProfile(profile); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, 0, "enterprise.seller_profile.update", map[string]any{"company_name": profile.CompanyName})
	common.ApiSuccess(c, nil)
}

// ---------------------------------------------------------------------------
// 企业控制台
// ---------------------------------------------------------------------------

func ListEnterpriseBillsSelf(c *gin.Context) {
	writeEnterpriseBills(c, currentEnterprise(c).Id)
}

func GetEnterpriseBillSelf(c *gin.Context) {
	id, ok := paramBillId(c)
	if !ok {
		return
	}
	bill, err := model.GetEnterpriseBill(id)
	if err != nil || bill.EnterpriseId != currentEnterprise(c).Id {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "bill not found"})
		return
	}
	common.ApiSuccess(c, bill)
}
