package controller

import (
	"github.com/shopspring/decimal"

	"errors"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 推广人模块接口（TokenFunc 二开）。推广中心四个查询 handler 由自助路由（PromoterAuth）
// 与管理员路由（PromoterFromParam）共用，推广人对象统一从上下文取。

// promoterFromContext 取中间件放入的推广人
func promoterFromContext(c *gin.Context) *model.Promoter {
	promoter, _ := c.Get(middleware.ContextKeyPromoter)
	result, _ := promoter.(*model.Promoter)
	return result
}

// promoterCenterRange 区间：显式传了 start / end / ts_* 时走 financeUsageRange，否则缺省本月 1 日 → 今天
func promoterCenterRange(c *gin.Context) (model.FinanceRange, bool) {
	if c.Query("start") == "" && c.Query("end") == "" && c.Query("start_date") == "" && c.Query("end_date") == "" &&
		c.Query("ts_start") == "" && c.Query("ts_end") == "" {
		return service.CurrentMonthRange(time.Now()), true
	}
	return financeUsageRange(c, model.FinanceMaxRangeDays)
}

// GetPromoterSelf 当前用户的推广人档案；非推广人返回 data=null（前端菜单显隐用）
func GetPromoterSelf(c *gin.Context) {
	promoter, err := model.GetActivePromoterByUserId(c.GetInt("id"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiSuccess(c, nil)
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	profile, err := service.GetPromoterProfile(promoter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, profile)
}

// GetPromoterCenterOverview 总览（汇总 + 每日）
func GetPromoterCenterOverview(c *gin.Context) {
	r, ok := promoterCenterRange(c)
	if !ok {
		return
	}
	overview, err := service.GetPromoterCenterOverview(promoterFromContext(c), r)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, overview)
}

// ListPromoterCenterUsers 名下用户消耗；管理员视图附邮箱 / 分组 / 操作人
func ListPromoterCenterUsers(c *gin.Context) {
	r, ok := promoterCenterRange(c)
	if !ok {
		return
	}
	users, err := service.ListPromoterCenterUsers(promoterFromContext(c), r, c.GetInt("role") >= common.RoleAdminUser)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"range": r, "items": users})
}

// ListPromoterCenterModels 模型消费
func ListPromoterCenterModels(c *gin.Context) {
	r, ok := promoterCenterRange(c)
	if !ok {
		return
	}
	models, err := service.ListPromoterCenterModels(promoterFromContext(c), r)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, models)
}

// GetPromoterCenterUserUsage 名下单个用户下钻
func GetPromoterCenterUserUsage(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "invalid user_id")
		return
	}
	r, ok := promoterCenterRange(c)
	if !ok {
		return
	}
	usage, err := service.GetPromoterCenterUserUsage(promoterFromContext(c), userId, r)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, usage)
}

// ---------------------------------------------------------------------------
// 管理端
// ---------------------------------------------------------------------------

// AdminPromoterListItem 推广人列表一行
type AdminPromoterListItem struct {
	service.PromoterProfile
	Email          string `json:"email"`
	Deleted        bool   `json:"deleted"`
	BoundUserCount int64  `json:"bound_user_count"`
	MonthNetQuota  int64  `json:"month_net_quota"`
}

// AdminListPromoters 推广人分页列表：附绑定数与本月净消耗
func AdminListPromoters(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	promoters, total, err := model.ListActivePromoters(c.Query("keyword"), pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userIds := make([]int, 0, len(promoters))
	for _, promoter := range promoters {
		userIds = append(userIds, promoter.UserId)
	}
	briefs, err := model.GetPromoterUserBriefs(userIds)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	counts, err := model.CountActiveBindingsByPromoters(userIds)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	monthNet, err := service.PromoterNetQuotaByPromoter(userIds, service.CurrentMonthRange(time.Now()))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]AdminPromoterListItem, 0, len(promoters))
	for _, promoter := range promoters {
		item := AdminPromoterListItem{
			PromoterProfile: service.PromoterProfile{Id: promoter.Id, UserId: promoter.UserId, Remark: promoter.Remark, CreatedAt: promoter.CreatedAt},
			BoundUserCount:  counts[promoter.UserId], MonthNetQuota: monthNet[promoter.UserId],
		}
		if brief := briefs[promoter.UserId]; brief != nil {
			item.Username, item.DisplayName, item.Email, item.Deleted = brief.Username, brief.DisplayName, brief.Email, brief.Deleted
		}
		items = append(items, item)
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

type adminPromoterRequest struct {
	UserId    int     `json:"user_id"`
	Remark    string  `json:"remark"`
	ShareRate float64 `json:"share_rate"`
}

// AdminCreatePromoter 设为推广人
func AdminCreatePromoter(c *gin.Context) {
	var req adminPromoterRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UserId <= 0 {
		common.ApiErrorMsg(c, "invalid request")
		return
	}
	if len(req.Remark) > 255 {
		common.ApiErrorMsg(c, "remark too long")
		return
	}
	promoter, err := service.SetPromoter(c.GetInt("id"), req.UserId, req.Remark, req.ShareRate)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	profile, err := service.GetPromoterProfile(promoter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, promoter.UserId, "promoter.create", map[string]any{"username": profile.Username, "user_id": promoter.UserId, "remark": promoter.Remark, "share_rate": promoter.ShareRate})
	common.ApiSuccess(c, profile)
}

// AdminUpdatePromoter 修改备注与分成比例（比例只做标识，不参与计算）
func AdminUpdatePromoter(c *gin.Context) {
	promoter := promoterFromContext(c)
	var req adminPromoterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "invalid request")
		return
	}
	if len(req.Remark) > 255 {
		common.ApiErrorMsg(c, "remark too long")
		return
	}
	if err := service.UpdatePromoter(promoter, req.Remark, req.ShareRate); err != nil {
		common.ApiError(c, err)
		return
	}
	profile, err := service.GetPromoterProfile(promoter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, promoter.UserId, "promoter.update", map[string]any{"username": profile.Username, "user_id": promoter.UserId, "remark": promoter.Remark, "share_rate": promoter.ShareRate})
	common.ApiSuccess(c, profile)
}

// AdminRemovePromoter 移除推广人（级联解绑）
func AdminRemovePromoter(c *gin.Context) {
	promoter := promoterFromContext(c)
	username, _ := model.GetUsernameById(promoter.UserId, true)
	unbound, err := service.UnsetPromoter(c.GetInt("id"), promoter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, promoter.UserId, "promoter.remove", map[string]any{"username": username, "user_id": promoter.UserId, "unbound": unbound})
	common.ApiSuccess(c, gin.H{"unbound_count": unbound})
}

type adminPromoterBindRequest struct {
	Inputs         []string `json:"inputs"`
	IncludeHistory bool     `json:"include_history"`
}

// AdminBindPromoterUsers 批量绑定（每项为用户名或数字 ID）
func AdminBindPromoterUsers(c *gin.Context) {
	promoter := promoterFromContext(c)
	var req adminPromoterBindRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Inputs) == 0 {
		common.ApiErrorMsg(c, "invalid request")
		return
	}
	result, err := service.BindUsers(c.GetInt("id"), promoter.UserId, req.Inputs, req.IncludeHistory)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(result.Bound) > 0 {
		username, _ := model.GetUsernameById(promoter.UserId, true)
		boundIds := make([]int, 0, len(result.Bound))
		for _, user := range result.Bound {
			boundIds = append(boundIds, user.Id)
		}
		recordManageAuditFor(c, promoter.UserId, "promoter.bind", map[string]any{
			"username": username, "user_id": promoter.UserId, "bound": len(result.Bound), "bound_user_ids": boundIds, "include_history": req.IncludeHistory,
		})
	}
	common.ApiSuccess(c, result)
}

// AdminUnbindPromoterUser 解绑单个用户
func AdminUnbindPromoterUser(c *gin.Context) {
	promoter := promoterFromContext(c)
	userId, err := strconv.Atoi(c.Param("user_id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "invalid user_id")
		return
	}
	if err := service.UnbindUser(c.GetInt("id"), promoter.UserId, userId); err != nil {
		common.ApiError(c, err)
		return
	}
	username, _ := model.GetUsernameById(promoter.UserId, true)
	targetUsername, _ := model.GetUsernameById(userId, true)
	recordManageAuditFor(c, promoter.UserId, "promoter.unbind", map[string]any{
		"username": username, "user_id": promoter.UserId, "target_username": targetUsername, "target_user_id": userId,
	})
	common.ApiSuccess(c, nil)
}

// ---------------------------------------------------------------------------
// 结算（推广人 × 自然月）
// ---------------------------------------------------------------------------

// ListPromoterCenterSettlements 结算列表：缺省列出区间覆盖的自然月；all=true 列出推广人创建月至今全部月份。
// 流水号 / 操作人 / 核销数只对管理员下发。
func ListPromoterCenterSettlements(c *gin.Context) {
	promoter := promoterFromContext(c)
	now := time.Now()
	var months []string
	if c.Query("all") == "true" {
		months = service.PromoterAllMonths(promoter.CreatedAt, now)
	} else {
		r, ok := promoterCenterRange(c)
		if !ok {
			return
		}
		months = service.PromoterMonthsInRange(r)
	}
	withOperator := c.GetInt("role") >= common.RoleAdminUser
	items, err := service.ListPromoterSettlementMonths(promoter, months, now, withOperator)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items})
}

type adminPromoterSettleRequest struct {
	Month     string   `json:"month"`
	AmountUSD *float64 `json:"amount_usd"`
	Reference string   `json:"reference"`
	Remark    string   `json:"remark"`
}

// AdminMarkPromoterSettled 标记某月已结算（金额可选，只做记录）
func AdminMarkPromoterSettled(c *gin.Context) {
	promoter := promoterFromContext(c)
	var req adminPromoterSettleRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Month == "" {
		common.ApiErrorMsg(c, "invalid request")
		return
	}
	amount := decimal.NullDecimal{}
	if req.AmountUSD != nil {
		amount = decimal.NewNullDecimal(decimal.NewFromFloat(*req.AmountUSD).Round(6))
	}
	settlement, err := service.MarkPromoterSettled(c.GetInt("id"), promoter, req.Month, amount, req.Reference, req.Remark, time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	username, _ := model.GetUsernameById(promoter.UserId, true)
	recordManageAuditFor(c, promoter.UserId, "promoter.settle", map[string]any{
		"username": username, "user_id": promoter.UserId, "month": settlement.Month,
		"net_quota": settlement.NetQuotaSnapshot, "credit_unpaid_quota": settlement.CreditUnpaidSnapshot, "share_rate": settlement.ShareRateSnapshot,
		"amount_usd": promoterSettlementAmountText(settlement.AmountUSD), "reference": settlement.Reference, "remark": settlement.Remark,
	})
	common.ApiSuccess(c, settlement)
}

// AdminRevertPromoterSettlement 撤销某月结算
func AdminRevertPromoterSettlement(c *gin.Context) {
	promoter := promoterFromContext(c)
	month := c.Param("month")
	previous, _ := model.GetActivePromoterSettlement(promoter.UserId, month)
	if err := service.RevertPromoterSettlement(c.GetInt("id"), promoter, month, time.Now()); err != nil {
		common.ApiError(c, err)
		return
	}
	username, _ := model.GetUsernameById(promoter.UserId, true)
	params := map[string]any{"username": username, "user_id": promoter.UserId, "month": month}
	if previous != nil {
		params["amount_usd"], params["reference"] = promoterSettlementAmountText(previous.AmountUSD), previous.Reference
	}
	recordManageAuditFor(c, promoter.UserId, "promoter.settle_revert", params)
	common.ApiSuccess(c, nil)
}

func promoterSettlementAmountText(amount decimal.NullDecimal) string {
	if !amount.Valid {
		return "-"
	}
	return amount.Decimal.String()
}
