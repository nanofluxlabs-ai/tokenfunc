package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// currentEnterprise 取 EnterpriseAuth 写入上下文的企业
func currentEnterprise(c *gin.Context) *model.Enterprise {
	return c.MustGet(middleware.ContextKeyEnterprise).(*model.Enterprise)
}

// currentActor 当前登录者在企业里的身份（角色、团队）
func currentActor(c *gin.Context) *model.EnterpriseActor {
	return c.MustGet(middleware.ContextKeyEnterpriseActor).(*model.EnterpriseActor)
}

// currentScope 当前身份的查询范围：企业主 / 企业管理员看全企业，团队角色只看本团队
func currentScope(c *gin.Context) model.EnterpriseScope {
	return currentActor(c).Scope()
}

// enterpriseApiError 把企业模块的业务错误映射成对用户友好的响应，其余错误走通用处理
func enterpriseApiError(c *gin.Context, err error) {
	if errors.Is(err, model.ErrEnterpriseResourceNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
		return
	}
	for _, businessErr := range []error{
		model.ErrEnterpriseTeamInUse,
		model.ErrEnterpriseTeamDefault,
		model.ErrEnterpriseTeamArchived,
		model.ErrEnterpriseDuplicateName,
		model.ErrEnterpriseMemberNotActive,
		model.ErrEnterpriseMemberTeamMismatch,
		model.ErrEnterpriseMemberNoLogin,
		model.ErrEnterpriseMemberHasLogin,
		model.ErrEnterpriseLoginUserTaken,
		model.ErrEnterpriseLoginUserInvalid,
		model.ErrEnterpriseInvalidRole,
	} {
		if errors.Is(err, businessErr) {
			common.ApiErrorMsg(c, err.Error())
			return
		}
	}
	common.ApiError(c, err)
}

func paramId(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "invalid id")
		return 0, false
	}
	return id, true
}

// optionalIntQuery 解析可选的整数查询参数，缺省返回 nil
func optionalIntQuery(c *gin.Context, key string) *int {
	raw := c.Query(key)
	if raw == "" {
		return nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return nil
	}
	return &value
}

// optionalBoolQuery 解析可选的布尔查询参数（true/false），缺省返回 nil
func optionalBoolQuery(c *gin.Context, key string) *bool {
	switch c.Query(key) {
	case "true", "1":
		value := true
		return &value
	case "false", "0":
		value := false
		return &value
	}
	return nil
}

// enterpriseSelfResponse 企业资料 + 当前身份（前端据 actor 决定菜单与范围）
type enterpriseSelfResponse struct {
	*model.Enterprise
	Actor *model.EnterpriseActor `json:"actor"`
}

// GetEnterpriseSelf 返回当前用户的企业资料与身份；非企业用户返回 data=null（前端据此决定是否显示企业菜单）
func GetEnterpriseSelf(c *gin.Context) {
	enterprise, actor, err := model.GetEnterpriseAccess(c.GetInt("id"))
	if errors.Is(err, model.ErrEnterpriseNoAccess) {
		common.ApiSuccess(c, nil)
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, enterpriseSelfResponse{Enterprise: enterprise, Actor: actor})
}

// ---------------------------------------------------------------------------
// 团队
// ---------------------------------------------------------------------------

type enterpriseTeamRequest struct {
	Name               string   `json:"name"`
	Sort               int      `json:"sort"`
	MonthlyBudgetUSD   *float64 `json:"monthly_budget_usd"`
	BudgetAlertPercent *int     `json:"budget_alert_percent"`
	BudgetEnforce      bool     `json:"budget_enforce"`
}

func (r enterpriseTeamRequest) toTeam(enterpriseId int) (*model.EnterpriseTeam, error) {
	team := &model.EnterpriseTeam{EnterpriseId: enterpriseId, Name: r.Name, Sort: r.Sort, BudgetAlertPercent: 80, BudgetEnforce: r.BudgetEnforce}
	if r.BudgetAlertPercent != nil {
		team.BudgetAlertPercent = *r.BudgetAlertPercent
	}
	if r.MonthlyBudgetUSD != nil {
		quota, err := usdToQuota(*r.MonthlyBudgetUSD)
		if err != nil {
			return nil, err
		}
		team.MonthlyBudgetQuota = int64(quota)
	}
	return team, nil
}

func ListEnterpriseTeams(c *gin.Context) {
	teams, err := model.ListEnterpriseTeams(currentEnterprise(c).Id, currentScope(c))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, teams)
}

func CreateEnterpriseTeam(c *gin.Context) {
	var req enterpriseTeamRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	team, err := req.toTeam(currentEnterprise(c).Id)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if err := model.CreateEnterpriseTeam(team); err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.team.create", map[string]any{"team_id": team.Id, "team_name": team.Name})
	common.ApiSuccess(c, team)
}

func UpdateEnterpriseTeam(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req enterpriseTeamRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	team, err := req.toTeam(currentEnterprise(c).Id)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	team.Id = id
	if err := model.UpdateEnterpriseTeam(team); err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.team.update", map[string]any{"team_id": id, "team_name": team.Name, "monthly_budget_quota": team.MonthlyBudgetQuota, "budget_enforce": team.BudgetEnforce})
	common.ApiSuccess(c, nil)
}

func ArchiveEnterpriseTeam(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	if err := model.ArchiveEnterpriseTeam(currentEnterprise(c).Id, id); err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.team.archive", map[string]any{"team_id": id})
	common.ApiSuccess(c, nil)
}

func DeleteEnterpriseTeam(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	if err := model.DeleteEnterpriseTeam(currentEnterprise(c).Id, id); err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.team.delete", map[string]any{"team_id": id})
	common.ApiSuccess(c, nil)
}

// ---------------------------------------------------------------------------
// 成员
// ---------------------------------------------------------------------------

type enterpriseMemberRequest struct {
	TeamId     int    `json:"team_id"`
	Name       string `json:"name"`
	Email      string `json:"email"`
	EmployeeNo string `json:"employee_no"`
	Status     string `json:"status"`
	Remark     string `json:"remark"`
}

func (r enterpriseMemberRequest) toMember(enterpriseId int) *model.EnterpriseMember {
	return &model.EnterpriseMember{
		EnterpriseId: enterpriseId,
		TeamId:       r.TeamId,
		Name:         r.Name,
		Email:        r.Email,
		EmployeeNo:   r.EmployeeNo,
		Status:       r.Status,
		Remark:       r.Remark,
	}
}

// resolveScopedTeam 团队角色创建/移动成员与 key 时，目标团队只能是自己的团队；0 对团队角色表示本团队
func resolveScopedTeam(c *gin.Context, teamId int) (int, bool) {
	scope := currentScope(c)
	if scope.TeamId == nil {
		return teamId, true
	}
	if teamId == 0 || teamId == *scope.TeamId {
		return *scope.TeamId, true
	}
	c.JSON(http.StatusNotFound, gin.H{"success": false, "message": model.ErrEnterpriseResourceNotFound.Error()})
	return 0, false
}

func ListEnterpriseMembers(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := model.EnterpriseMemberFilter{
		TeamId:   optionalIntQuery(c, "team_id"),
		Keyword:  c.Query("keyword"),
		Status:   c.Query("status"),
		HasLogin: optionalBoolQuery(c, "has_login"),
	}
	items, total, err := model.ListEnterpriseMembers(currentEnterprise(c).Id, currentScope(c), filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func CreateEnterpriseMember(c *gin.Context) {
	var req enterpriseMemberRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	teamId, ok := resolveScopedTeam(c, req.TeamId)
	if !ok {
		return
	}
	member := req.toMember(currentEnterprise(c).Id)
	member.TeamId = teamId
	if err := model.CreateEnterpriseMember(member); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, member)
}

// ImportEnterpriseMembers 批量导入成员（JSON 行数组，CSV 由前端解析）；任一行出错则整批不写入
func ImportEnterpriseMembers(c *gin.Context) {
	var req struct {
		Rows []model.EnterpriseMemberImportRow `json:"rows"`
	}
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	result, err := model.ImportEnterpriseMembers(currentEnterprise(c).Id, currentScope(c), req.Rows)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func UpdateEnterpriseMember(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req enterpriseMemberRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	enterprise := currentEnterprise(c)
	if _, err := model.GetEnterpriseMember(enterprise.Id, id, currentScope(c)); err != nil {
		enterpriseApiError(c, err)
		return
	}
	teamId, ok := resolveScopedTeam(c, req.TeamId)
	if !ok {
		return
	}
	member := req.toMember(enterprise.Id)
	member.Id = id
	member.TeamId = teamId
	if err := model.UpdateEnterpriseMember(member); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func DeleteEnterpriseMember(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	enterprise := currentEnterprise(c)
	if _, err := model.GetEnterpriseMember(enterprise.Id, id, currentScope(c)); err != nil {
		enterpriseApiError(c, err)
		return
	}
	if err := model.DeleteEnterpriseMember(enterprise.Id, id); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ---------------------------------------------------------------------------
// 成员登录账号与角色
// ---------------------------------------------------------------------------

// canAssignRole 角色分配权限：企业主可设任何角色；企业管理员最多设到 team_admin；团队管理员只能设 developer
func canAssignRole(actor *model.EnterpriseActor, role string) bool {
	switch role {
	case model.EnterpriseMemberRoleEnterpriseAdmin:
		return actor.IsOwner
	case model.EnterpriseMemberRoleTeamAdmin:
		return actor.AtLeast(model.EnterpriseMemberRoleEnterpriseAdmin)
	case model.EnterpriseMemberRoleDeveloper:
		return actor.AtLeast(model.EnterpriseMemberRoleTeamAdmin)
	}
	return false
}

type enterpriseMemberLoginRequest struct {
	Mode       string `json:"mode"` // bind: 绑定已有账号；provision: 一键开通
	Identifier string `json:"identifier"`
	Role       string `json:"role"`
}

// SetEnterpriseMemberLogin 给成员开通控制台登录：绑定已有账号或一键开通新账号
func SetEnterpriseMemberLogin(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req enterpriseMemberLoginRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if req.Role == "" {
		req.Role = model.EnterpriseMemberRoleDeveloper
	}
	actor := currentActor(c)
	if !canAssignRole(actor, req.Role) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "you cannot grant this role"})
		return
	}
	enterprise := currentEnterprise(c)
	if _, err := model.GetEnterpriseMember(enterprise.Id, id, currentScope(c)); err != nil {
		enterpriseApiError(c, err)
		return
	}
	switch req.Mode {
	case "bind":
		user, err := model.FindUserForEnterpriseLogin(req.Identifier)
		if err != nil {
			enterpriseApiError(c, err)
			return
		}
		if err := model.BindEnterpriseMemberLogin(enterprise.Id, id, user, req.Role); err != nil {
			enterpriseApiError(c, err)
			return
		}
		recordEnterpriseConsoleAudit(c, "enterprise.member.login_bind", map[string]any{"member_id": id, "username": user.Username, "user_id": user.Id, "role": req.Role})
		common.ApiSuccess(c, gin.H{"user_id": user.Id, "username": user.Username})
	case "provision":
		login, err := model.ProvisionEnterpriseMemberLogin(enterprise.Id, id, req.Role)
		if err != nil {
			enterpriseApiError(c, err)
			return
		}
		recordEnterpriseConsoleAudit(c, "enterprise.member.login_provision", map[string]any{"member_id": id, "username": login.Username, "user_id": login.UserId, "role": req.Role})
		// 初始密码只在这里出现一次，不入库、不进审计
		common.ApiSuccess(c, login)
	default:
		common.ApiErrorMsg(c, "mode must be bind or provision")
	}
}

// RemoveEnterpriseMemberLogin 解绑登录账号（企业开通的账号同时停用）
func RemoveEnterpriseMemberLogin(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	enterprise := currentEnterprise(c)
	member, err := model.GetEnterpriseMember(enterprise.Id, id, currentScope(c))
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	if !canAssignRole(currentActor(c), member.Role) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "you cannot manage this member's role"})
		return
	}
	if err := model.UnbindEnterpriseMemberLogin(enterprise.Id, id); err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.member.login_unbind", map[string]any{"member_id": id, "user_id": member.UserId})
	common.ApiSuccess(c, nil)
}

// SetEnterpriseMemberRole 改角色：操作者必须同时有权授予新角色与管理旧角色
func SetEnterpriseMemberRole(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	enterprise := currentEnterprise(c)
	member, err := model.GetEnterpriseMember(enterprise.Id, id, currentScope(c))
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	actor := currentActor(c)
	if !canAssignRole(actor, req.Role) || (member.Role != model.EnterpriseMemberRoleNone && !canAssignRole(actor, member.Role)) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "you cannot grant this role"})
		return
	}
	if err := model.SetEnterpriseMemberRole(enterprise.Id, id, req.Role); err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.member.role", map[string]any{"member_id": id, "user_id": member.UserId, "from": member.Role, "to": req.Role})
	common.ApiSuccess(c, nil)
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

// recordEnterpriseConsoleAudit 企业控制台内的组织/权限变更审计（操作者是企业主或成员，不是平台管理员）
func recordEnterpriseConsoleAudit(c *gin.Context, action string, params map[string]any) {
	if params == nil {
		params = map[string]any{}
	}
	params["enterprise_id"] = currentEnterprise(c).Id
	recordUserSecurityAudit(c, c.GetInt("id"), action, params)
}
