package controller

import (
	"errors"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type adminQuoteRequest struct {
	CustomerName    string                      `json:"customer_name"`
	CustomerContact string                      `json:"customer_contact"`
	CustomerEmail   string                      `json:"customer_email"`
	DiscountPercent float64                     `json:"discount_percent"`
	ValidUntil      int64                       `json:"valid_until"`
	Notes           string                      `json:"notes"`
	Items           []model.EnterpriseQuoteItem `json:"items"`
}

// AdminCreateQuote 生成报价单：挂牌价由前端从系统定价取得，折后价在服务端计算并快照
func AdminCreateQuote(c *gin.Context) {
	var req adminQuoteRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if len(req.CustomerContact) > 64 || len(req.CustomerEmail) > 128 {
		common.ApiErrorMsg(c, "customer contact or email is too long")
		return
	}
	quote := &model.EnterpriseQuote{
		CustomerName:    req.CustomerName,
		CustomerContact: req.CustomerContact,
		CustomerEmail:   req.CustomerEmail,
		DiscountPercent: req.DiscountPercent,
		ValidUntil:      req.ValidUntil,
		Notes:           req.Notes,
		CreatedBy:       c.GetInt("id"),
	}
	created, err := model.CreateEnterpriseQuote(quote, req.Items)
	if err != nil {
		if errors.Is(err, model.ErrEnterpriseQuoteInvalid) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, 0, "enterprise.quote.create", map[string]any{
		"quote_id": created.Id, "quote_no": created.QuoteNo, "customer_name": created.CustomerName, "models": len(req.Items),
	})
	common.ApiSuccess(c, created)
}

func AdminListQuotes(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	quotes, total, err := model.ListEnterpriseQuotes(c.Query("keyword"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(quotes)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetQuote(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "invalid quote id")
		return
	}
	quote, err := model.GetEnterpriseQuote(id)
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, quote)
}
