package controller

import (
	"net"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// 企业 API 密钥页的接口：企业的 key 只在这里管（上游 /api/token 对成员账号不可见），
// 底层复用上游 tokens 表与 token.Update() / 缓存失效，只多一层归属与范围校验。

const (
	enterpriseTokenMaxAllowIps = 50
	enterpriseTokenBatchMax    = 200
)

type enterpriseTokenRequest struct {
	Name           string   `json:"name"`
	TeamId         int      `json:"team_id"`
	MemberId       int      `json:"member_id"`
	RemainQuota    int      `json:"remain_quota"`
	UnlimitedQuota bool     `json:"unlimited_quota"`
	ExpiredTime    int64    `json:"expired_time"`
	Group          string   `json:"group"`
	ModelLimits    []string `json:"model_limits"`
	AllowIps       string   `json:"allow_ips"`
}

type enterpriseTokenAssignmentRequest struct {
	TeamId   int `json:"team_id"`
	MemberId int `json:"member_id"`
}

type enterpriseTokenStatusRequest struct {
	Status int `json:"status"`
}

type enterpriseTokenBatchRequest struct {
	Ids    []int `json:"ids"`
	Status int   `json:"status"`
}

// enterpriseTokenPolicy 校验后的访问限制，直接写进 tokens
type enterpriseTokenPolicy struct {
	group       string
	modelLimits string
	allowIps    string
}

// enterpriseTokenLimit 企业 key 总数上限：站点每用户上限与企业自身上限取大
func enterpriseTokenLimit(enterprise *model.Enterprise) int {
	return max(operation_setting.GetMaxUserTokens(), enterprise.MaxTokens)
}

// validateEnterpriseTokenRequest 校验名称 / 额度 / 过期 / 分组 / 模型白名单 / IP 白名单；失败时已写响应
func validateEnterpriseTokenRequest(c *gin.Context, enterprise *model.Enterprise, req *enterpriseTokenRequest) (*enterpriseTokenPolicy, bool) {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 50 {
		common.ApiErrorMsg(c, "key name is required and must be at most 50 characters")
		return nil, false
	}
	if !req.UnlimitedQuota && (req.RemainQuota < 0 || req.RemainQuota > maxTokenQuota()) {
		common.ApiErrorMsg(c, "invalid key quota")
		return nil, false
	}
	if req.ExpiredTime != -1 && req.ExpiredTime != 0 && req.ExpiredTime < common.GetTimestamp() {
		common.ApiErrorMsg(c, "expiration time must be in the future")
		return nil, false
	}
	if req.ExpiredTime == 0 {
		req.ExpiredTime = -1
	}
	ownerGroup, err := model.GetUserGroup(enterprise.UserId, false)
	if err != nil {
		common.ApiError(c, err)
		return nil, false
	}
	policy := &enterpriseTokenPolicy{group: strings.TrimSpace(req.Group)}
	if policy.group != "" && !service.IsUserSelectableGroup(ownerGroup, policy.group) {
		common.ApiErrorMsg(c, "group is not available to this enterprise: "+policy.group)
		return nil, false
	}
	// IP 白名单：每行一个 IP 或 CIDR，最多 50 行
	ips := make([]string, 0)
	for line := range strings.SplitSeq(strings.ReplaceAll(req.AllowIps, ",", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if net.ParseIP(line) == nil {
			if _, _, err := net.ParseCIDR(line); err != nil {
				common.ApiErrorMsg(c, "invalid IP or CIDR: "+line)
				return nil, false
			}
		}
		ips = append(ips, line)
	}
	if len(ips) > enterpriseTokenMaxAllowIps {
		common.ApiErrorMsg(c, "at most "+strconv.Itoa(enterpriseTokenMaxAllowIps)+" IP whitelist entries")
		return nil, false
	}
	policy.allowIps = strings.Join(ips, "\n")
	// 模型白名单：去重，且必须在所选分组（未选分组时为主账号分组）启用的模型里
	limits := make([]string, 0, len(req.ModelLimits))
	for _, name := range req.ModelLimits {
		name = strings.TrimSpace(name)
		if name == "" || slices.Contains(limits, name) {
			continue
		}
		limits = append(limits, name)
	}
	if len(limits) > 0 {
		effectiveGroup := policy.group
		if effectiveGroup == "" {
			effectiveGroup = ownerGroup
		}
		allowed := service.GetGroupsEnabledModels([]string{effectiveGroup})
		for _, name := range limits {
			if !slices.Contains(allowed, name) {
				common.ApiErrorMsg(c, "model is not available in group "+effectiveGroup+": "+name)
				return nil, false
			}
		}
	}
	policy.modelLimits = strings.Join(limits, ",")
	return policy, true
}

func ListEnterpriseTokens(c *gin.Context) {
	enterprise := currentEnterprise(c)
	pageInfo := common.GetPageQuery(c)
	expiring, _ := strconv.ParseBool(c.Query("expiring"))
	filter := model.EnterpriseTokenFilter{
		TeamId:   optionalIntQuery(c, "team_id"),
		MemberId: optionalIntQuery(c, "member_id"),
		Status:   optionalIntQuery(c, "status"),
		Expiring: expiring,
		Keyword:  c.Query("keyword"),
	}
	items, total, err := model.ListEnterpriseTokens(enterprise.Id, enterprise.UserId, currentScope(c), filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

// GetEnterpriseTokenOptions 新建 / 编辑抽屉的可选项：主账号可选分组、各分组启用的模型、key 上限与当前总数
func GetEnterpriseTokenOptions(c *gin.Context) {
	enterprise := currentEnterprise(c)
	ownerGroup, err := model.GetUserGroup(enterprise.UserId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	usable := service.GetUserUsableGroups(ownerGroup)
	groups := make([]gin.H, 0, len(usable))
	modelsByGroup := map[string][]string{}
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		desc, ok := usable[groupName]
		if !ok || !service.IsUserSelectableGroup(ownerGroup, groupName) {
			continue
		}
		groups = append(groups, gin.H{"value": groupName, "desc": desc, "ratio": service.GetUserGroupRatio(ownerGroup, groupName)})
		modelsByGroup[groupName] = service.GetGroupsEnabledModels([]string{groupName})
	}
	slices.SortFunc(groups, func(a, b gin.H) int { return strings.Compare(a["value"].(string), b["value"].(string)) })
	// 不选分组时按主账号分组路由
	modelsByGroup[""] = service.GetGroupsEnabledModels([]string{ownerGroup})
	total, err := model.CountUserTokens(enterprise.UserId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"owner_group":     ownerGroup,
		"groups":          groups,
		"models_by_group": modelsByGroup,
		"limit":           enterpriseTokenLimit(enterprise),
		"total":           total,
	})
}

// CreateEnterpriseToken 为团队 / 持有人创建 key（key 始终落在企业主账号名下）
func CreateEnterpriseToken(c *gin.Context) {
	enterprise := currentEnterprise(c)
	var req enterpriseTokenRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	policy, ok := validateEnterpriseTokenRequest(c, enterprise, &req)
	if !ok {
		return
	}
	teamId, ok := resolveScopedTeam(c, req.TeamId)
	if !ok {
		return
	}
	count, err := model.CountUserTokens(enterprise.UserId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if limit := enterpriseTokenLimit(enterprise); int(count) >= limit {
		common.ApiErrorMsg(c, "maximum number of API keys reached ("+strconv.Itoa(limit)+")")
		return
	}
	key, err := common.GenerateKey()
	if err != nil {
		common.ApiErrorMsg(c, "failed to generate key")
		return
	}
	now := common.GetTimestamp()
	allowIps := policy.allowIps
	token := &model.Token{
		UserId:             enterprise.UserId,
		Name:               req.Name,
		Key:                key,
		CreatedTime:        now,
		AccessedTime:       now,
		ExpiredTime:        req.ExpiredTime,
		RemainQuota:        req.RemainQuota,
		UnlimitedQuota:     req.UnlimitedQuota,
		Group:              policy.group,
		ModelLimitsEnabled: policy.modelLimits != "",
		ModelLimits:        policy.modelLimits,
		AllowIps:           &allowIps,
	}
	if err := model.CreateEnterpriseToken(enterprise.Id, currentScope(c), token, teamId, req.MemberId); err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.token.create", map[string]any{"token_id": token.Id, "name": token.Name, "team_id": teamId, "member_id": req.MemberId})
	// 与上游一致：创建时只返回 id，明文 key 通过「查看 key」接口获取
	common.ApiSuccess(c, gin.H{"id": token.Id})
}

// UpdateEnterpriseToken 编辑 key 的全部字段（含归属）；归属变化只影响之后的请求
func UpdateEnterpriseToken(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	enterprise := currentEnterprise(c)
	var req enterpriseTokenRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	policy, ok := validateEnterpriseTokenRequest(c, enterprise, &req)
	if !ok {
		return
	}
	token, assignment, err := model.GetEnterpriseToken(enterprise.Id, enterprise.UserId, currentScope(c), id)
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	teamId, ok := resolveScopedTeam(c, req.TeamId)
	if !ok {
		return
	}
	if teamId != assignment.TeamId || req.MemberId != assignment.MemberId {
		if err := model.AssignEnterpriseToken(enterprise.Id, enterprise.UserId, currentScope(c), id, teamId, req.MemberId); err != nil {
			enterpriseApiError(c, err)
			return
		}
	}
	allowIps := policy.allowIps
	token.Name = req.Name
	token.ExpiredTime = req.ExpiredTime
	token.RemainQuota = req.RemainQuota
	token.UnlimitedQuota = req.UnlimitedQuota
	token.Group = policy.group
	token.ModelLimitsEnabled = policy.modelLimits != ""
	token.ModelLimits = policy.modelLimits
	token.AllowIps = &allowIps
	token.CrossGroupRetry = false
	_ = token.SetAutoGroups(nil)
	if err := token.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.token.update", map[string]any{"token_id": token.Id, "name": token.Name, "team_id": teamId, "member_id": req.MemberId})
	common.ApiSuccess(c, nil)
}

// UpdateEnterpriseTokenStatus 启用 / 停用；过期或耗尽的 key 不能启用（与上游一致）
func UpdateEnterpriseTokenStatus(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	enterprise := currentEnterprise(c)
	var req enterpriseTokenStatusRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if req.Status != common.TokenStatusEnabled && req.Status != common.TokenStatusDisabled {
		common.ApiErrorMsg(c, "status must be enabled or disabled")
		return
	}
	token, _, err := model.GetEnterpriseToken(enterprise.Id, enterprise.UserId, currentScope(c), id)
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	if req.Status == common.TokenStatusEnabled {
		if token.ExpiredTime != -1 && token.ExpiredTime <= common.GetTimestamp() {
			common.ApiErrorMsg(c, "key has expired; change the expiration time first")
			return
		}
		if !token.UnlimitedQuota && token.RemainQuota <= 0 {
			common.ApiErrorMsg(c, "key quota is exhausted; raise the quota first")
			return
		}
	}
	previous := token.Status
	token.Status = req.Status
	if err := token.SelectUpdate(); err != nil {
		common.ApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.token.status", map[string]any{"token_id": token.Id, "name": token.Name, "from": previous, "to": req.Status})
	common.ApiSuccess(c, nil)
}

func UpdateEnterpriseTokenAssignment(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req enterpriseTokenAssignmentRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	teamId, ok := resolveScopedTeam(c, req.TeamId)
	if !ok {
		return
	}
	enterprise := currentEnterprise(c)
	if err := model.AssignEnterpriseToken(enterprise.Id, enterprise.UserId, currentScope(c), id, teamId, req.MemberId); err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.token.update", map[string]any{"token_id": id, "team_id": teamId, "member_id": req.MemberId})
	common.ApiSuccess(c, nil)
}

// DeleteEnterpriseToken 删除 key；历史用量保留在报表与账单中
func DeleteEnterpriseToken(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	enterprise := currentEnterprise(c)
	token, err := model.DeleteEnterpriseToken(enterprise.Id, enterprise.UserId, currentScope(c), id)
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.token.delete", map[string]any{"token_id": token.Id, "name": token.Name})
	common.ApiSuccess(c, nil)
}

// GetEnterpriseTokenKey 返回企业 key 的明文（上游 /api/token/:id/key 按登录者查，成员账号拿不到主账号的 key）
func GetEnterpriseTokenKey(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	enterprise := currentEnterprise(c)
	token, _, err := model.GetEnterpriseToken(enterprise.Id, enterprise.UserId, currentScope(c), id)
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"key": token.Key})
}

func decodeEnterpriseTokenBatch(c *gin.Context) (*enterpriseTokenBatchRequest, bool) {
	var req enterpriseTokenBatchRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return nil, false
	}
	if len(req.Ids) == 0 {
		common.ApiErrorMsg(c, "ids are required")
		return nil, false
	}
	if len(req.Ids) > enterpriseTokenBatchMax {
		common.ApiErrorMsg(c, "at most "+strconv.Itoa(enterpriseTokenBatchMax)+" keys per batch")
		return nil, false
	}
	return &req, true
}

// BatchUpdateEnterpriseTokenStatus 批量启用 / 停用；任一 id 不在范围内整批 404
func BatchUpdateEnterpriseTokenStatus(c *gin.Context) {
	req, ok := decodeEnterpriseTokenBatch(c)
	if !ok {
		return
	}
	if req.Status != common.TokenStatusEnabled && req.Status != common.TokenStatusDisabled {
		common.ApiErrorMsg(c, "status must be enabled or disabled")
		return
	}
	enterprise := currentEnterprise(c)
	result, err := model.BatchUpdateEnterpriseTokenStatus(enterprise.Id, enterprise.UserId, currentScope(c), req.Ids, req.Status)
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.token.batch_status", map[string]any{"count": result.Updated, "status": req.Status, "skipped": len(result.Skipped)})
	common.ApiSuccess(c, result)
}

// BatchDeleteEnterpriseTokens 批量删除；任一 id 不在范围内整批 404
func BatchDeleteEnterpriseTokens(c *gin.Context) {
	req, ok := decodeEnterpriseTokenBatch(c)
	if !ok {
		return
	}
	enterprise := currentEnterprise(c)
	deleted, err := model.BatchDeleteEnterpriseTokens(enterprise.Id, enterprise.UserId, currentScope(c), req.Ids)
	if err != nil {
		enterpriseApiError(c, err)
		return
	}
	recordEnterpriseConsoleAudit(c, "enterprise.token.batch_delete", map[string]any{"count": deleted})
	common.ApiSuccess(c, gin.H{"deleted": deleted})
}
