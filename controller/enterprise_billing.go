package controller

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// enterpriseCreditVerificationAction 开通 / 修改授信与切回预付的二次验证动作名（service.adminUserManageActions 白名单）
const enterpriseCreditVerificationAction = "enterprise_credit"

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
	// AlertPercent 预警阈值（0..99，0 关闭）；缺省沿用企业当前值，首次开通时为默认 80
	AlertPercent *int `json:"alert_percent"`
	// AutoReset 仅 cycle_type=quota_based 有效：用满即自动开下一期
	AutoReset bool `json:"auto_reset"`
}

// loadEnterpriseForCreditChange 读取授信变更的目标企业并要求管理员二次验证（proof 走 X-Security-Proof 请求头）；
// 失败时已写响应并返回 nil
func loadEnterpriseForCreditChange(c *gin.Context, id int) (*model.Enterprise, *model.AuthFlowAuthorization) {
	enterprise, err := model.GetEnterpriseById(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "enterprise not found"})
			return nil, nil
		}
		common.ApiError(c, err)
		return nil, nil
	}
	authorization := requireAdminUserProof(c, service.VerificationScopeAdminUserManage, service.AdminUserManageContext{UserID: enterprise.UserId, Action: enterpriseCreditVerificationAction})
	if authorization == nil {
		return nil, nil
	}
	return enterprise, authorization
}

// AdminConfigureEnterpriseCredit 开通/修改授信（额度立即生效，周期从下一期生效）。
// 参数校验在二次验证之前，验证在任何授信写入之前
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
	config := model.EnterpriseCreditConfig{
		CycleType: req.CycleType, CycleDays: req.CycleDays, LimitQuota: int64(limitQuota),
		AlertPercent: model.EnterpriseDefaultCreditAlertPercent,
		AutoReset:    req.CycleType == model.EnterpriseCreditCycleQuotaBased && req.AutoReset,
	}
	current, authorization := loadEnterpriseForCreditChange(c, id)
	if authorization == nil {
		return
	}
	if req.AlertPercent != nil {
		config.AlertPercent = *req.AlertPercent
	} else if current.BillingMode == model.EnterpriseBillingModeCredit {
		config.AlertPercent = current.CreditAlertPercent
	}
	if err := model.ConfigureEnterpriseCredit(id, config, c.GetInt("id")); err != nil {
		if errors.Is(err, model.ErrEnterpriseCreditConfig) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		enterpriseApiError(c, err)
		return
	}
	recordManageAuditFor(c, current.UserId, "enterprise.credit.configure", map[string]any{
		"enterprise_id": id, "cycle_type": req.CycleType, "cycle_days": req.CycleDays, "limit_usd": req.LimitUSD, "alert_percent": config.AlertPercent,
		"auto_reset": config.AutoReset, "verification_method": authorization.Method,
	})
	common.ApiSuccess(c, nil)
}

// AdminOpenEnterpriseCreditPeriod 手动开下一期：额度信用 auto_reset=false 用满出账后，不等收款提前放行（或账单作废后恢复服务）
func AdminOpenEnterpriseCreditPeriod(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	period, err := model.OpenNextCreditPeriod(id, c.GetInt("id"), "manual")
	if err != nil {
		if errors.Is(err, model.ErrEnterpriseNotCredit) || errors.Is(err, model.ErrEnterpriseCreditPeriodAlreadyOpen) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		enterpriseApiError(c, err)
		return
	}
	enterprise, _ := model.GetEnterpriseById(id)
	recordManageAuditFor(c, enterpriseOwnerId(enterprise), "enterprise.credit.period_open", map[string]any{
		"enterprise_id": id, "period_id": period.Id, "period_no": period.PeriodNo,
	})
	common.ApiSuccess(c, period)
}

// AdminSwitchEnterprisePrepaid 授信切回预付
func AdminSwitchEnterprisePrepaid(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	enterprise, authorization := loadEnterpriseForCreditChange(c, id)
	if authorization == nil {
		return
	}
	if err := model.SwitchEnterpriseToPrepaid(id, c.GetInt("id")); err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordManageAuditFor(c, enterprise.UserId, "enterprise.credit.disable", map[string]any{
		"enterprise_id": id, "verification_method": authorization.Method,
	})
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

// enterpriseOverviewScope 团队角色的可见范围（前端据此把第一张卡换成「本团队」）
type enterpriseOverviewScope struct {
	TeamId   int    `json:"team_id"`
	TeamName string `json:"team_name"`
}

// enterpriseOverviewTodos 待办：全部是计数或列表，前端无数据不渲染；账单与授信预警只对企业主 / 企业管理员下发
type enterpriseOverviewTodos struct {
	UnpaidBills        int                               `json:"unpaid_bills"`
	OverdueBills       int                               `json:"overdue_bills"`
	ExhaustedKeys      int                               `json:"exhausted_keys"`
	ExpiringKeys       int                               `json:"expiring_keys"`
	CreditAlertHit     bool                              `json:"credit_alert_hit"`
	TeamBudgetWarn     []*model.EnterpriseTeamBudgetItem `json:"team_budget_warn"`
	TeamBudgetExceeded []*model.EnterpriseTeamBudgetItem `json:"team_budget_exceeded"`
}

type enterpriseOverview struct {
	Enterprise   *model.Enterprise             `json:"enterprise"`
	BalanceQuota int                           `json:"balance_quota"`
	OpenPeriod   *model.EnterpriseCreditPeriod `json:"open_period"`
	*model.EnterpriseOverviewStats
	Todos enterpriseOverviewTodos `json:"todos"`
	// TeamBudget 团队角色：本团队的预算进度（未设预算为 nil）；企业视角为 nil
	TeamBudget *model.EnterpriseTeamBudgetItem `json:"team_budget"`
	Scope      *enterpriseOverviewScope        `json:"scope"`
}

// GetEnterpriseOverview 概览：KPI（本期 / 本月 / key / 组织）、待办、近 30 天按天消耗，全部来自小表。
// 企业主 / 企业管理员另有余额或当前账期与账单待办；团队角色只看本团队的统计，没有财务字段。
func GetEnterpriseOverview(c *gin.Context) {
	enterprise := currentEnterprise(c)
	actor := currentActor(c)
	scope := actor.Scope()
	now := time.Now()
	stats, err := model.LoadEnterpriseOverviewStats(enterprise, scope, now)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	overview := enterpriseOverview{Enterprise: enterprise, EnterpriseOverviewStats: stats}
	overview.Todos.ExhaustedKeys = stats.Keys.Exhausted
	overview.Todos.ExpiringKeys = stats.Keys.Expiring7d
	overview.Todos.TeamBudgetWarn = make([]*model.EnterpriseTeamBudgetItem, 0)
	overview.Todos.TeamBudgetExceeded = make([]*model.EnterpriseTeamBudgetItem, 0)
	for _, team := range stats.Teams {
		switch team.BudgetState {
		case model.TeamBudgetStateWarn:
			overview.Todos.TeamBudgetWarn = append(overview.Todos.TeamBudgetWarn, team)
		case model.TeamBudgetStateExceeded:
			overview.Todos.TeamBudgetExceeded = append(overview.Todos.TeamBudgetExceeded, team)
		}
	}
	if scope.TeamId != nil {
		overview.Scope = &enterpriseOverviewScope{TeamId: *scope.TeamId}
		for _, team := range stats.Teams {
			if team.TeamId == *scope.TeamId {
				overview.Scope.TeamName = team.TeamName
				if team.BudgetQuota > 0 {
					overview.TeamBudget = team
				}
			}
		}
	}
	if !actor.AtLeast(model.EnterpriseMemberRoleEnterpriseAdmin) {
		// 团队角色只给企业的标识字段：联系人、税号、授信额度与账单资料属于财务信息，不下发
		overview.Enterprise = &model.Enterprise{Id: enterprise.Id, Name: enterprise.Name, BillingMode: enterprise.BillingMode, Status: enterprise.Status}
		common.ApiSuccess(c, overview)
		return
	}
	unpaid, overdue, err := model.CountEnterpriseOutstandingBills(enterprise.Id, now.Unix())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	overview.Todos.UnpaidBills = unpaid
	overview.Todos.OverdueBills = overdue
	if enterprise.BillingMode == model.EnterpriseBillingModeCredit {
		period, err := model.GetOpenCreditPeriod(enterprise.Id)
		if err != nil && !errors.Is(err, model.ErrEnterpriseCreditNoOpenPeriod) {
			common.ApiError(c, err)
			return
		}
		overview.OpenPeriod = period
		if period != nil && enterprise.CreditAlertPercent > 0 && period.LimitQuota > 0 {
			overview.Todos.CreditAlertHit = period.UsedQuota*100 >= period.LimitQuota*int64(enterprise.CreditAlertPercent)
		}
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
	// ts_start / ts_end：秒级时间戳，缺省或非法按 0（不限）处理
	tsStart, _ := strconv.ParseInt(c.Query("ts_start"), 10, 64)
	tsEnd, _ := strconv.ParseInt(c.Query("ts_end"), 10, 64)
	entries, total, err := model.ListEnterpriseLedger(enterpriseId, c.Query("type"), tsStart, tsEnd, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
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
