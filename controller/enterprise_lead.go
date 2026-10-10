package controller

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 同一 IP 每 24 小时最多提交的试用申请数
const enterpriseLeadDailyLimitPerIP = 5

type enterpriseLeadRequest struct {
	Company string `json:"company"`
	Contact string `json:"contact"`
	Volume  string `json:"volume"`
}

// CreateEnterpriseTrialLead 营销页匿名提交企业试用申请；入库后异步通知 root
func CreateEnterpriseTrialLead(c *gin.Context) {
	var req enterpriseLeadRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	ip := c.ClientIP()
	count, err := model.CountRecentEnterpriseTrialLeadsByIP(ip)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if count >= enterpriseLeadDailyLimitPerIP {
		common.ApiErrorMsg(c, "too many requests, please contact sales directly")
		return
	}
	lead := &model.EnterpriseTrialLead{
		Company:  req.Company,
		Contact:  req.Contact,
		Volume:   req.Volume,
		ClientIP: ip,
	}
	if err := model.CreateEnterpriseTrialLead(lead); err != nil {
		if errors.Is(err, model.ErrEnterpriseLeadInvalid) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		common.ApiError(c, err)
		return
	}
	gopool.Go(func() {
		service.NotifyRootUser(
			dto.NotifyTypeChannelUpdate,
			"新的企业试用申请",
			fmt.Sprintf("公司：%s\n联系方式：%s\n预计月用量：%s\n来源 IP：%s", lead.Company, lead.Contact, lead.Volume, lead.ClientIP),
		)
	})
	common.ApiSuccess(c, gin.H{"id": lead.Id})
}

func AdminListEnterpriseTrialLeads(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	leads, total, err := model.ListEnterpriseTrialLeads(c.Query("status"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(leads)
	common.ApiSuccess(c, pageInfo)
}

type enterpriseLeadStatusRequest struct {
	Status string `json:"status"`
	Remark string `json:"remark"`
}

func AdminUpdateEnterpriseTrialLead(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "invalid lead id")
		return
	}
	var req enterpriseLeadStatusRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if len(req.Remark) > 2000 {
		common.ApiErrorMsg(c, "remark is too long")
		return
	}
	if err := model.UpdateEnterpriseTrialLeadStatus(id, req.Status, req.Remark); err != nil {
		if errors.Is(err, model.ErrEnterpriseLeadInvalid) || errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
