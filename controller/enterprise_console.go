package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// currentEnterprise 取 EnterpriseOwnerAuth 写入上下文的企业
func currentEnterprise(c *gin.Context) *model.Enterprise {
	return c.MustGet(middleware.ContextKeyEnterprise).(*model.Enterprise)
}

// enterpriseApiError 把企业模块的业务错误映射成对用户友好的响应，其余错误走通用处理
func enterpriseApiError(c *gin.Context, err error) {
	if errors.Is(err, model.ErrEnterpriseResourceNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
		return
	}
	for _, businessErr := range []error{
		model.ErrEnterpriseDepartmentInUse,
		model.ErrEnterpriseDepartmentCycle,
		model.ErrEnterpriseDuplicateName,
		model.ErrEnterpriseEmployeeNotActive,
		model.ErrEnterpriseProjectArchived,
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

// GetEnterpriseSelf 返回当前用户的企业资料；非企业用户返回 data=null（前端据此决定是否显示企业菜单）
func GetEnterpriseSelf(c *gin.Context) {
	enterprise, err := model.GetEnterpriseByUserId(c.GetInt("id"))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiSuccess(c, nil)
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, enterprise)
}

// ---------------------------------------------------------------------------
// 部门
// ---------------------------------------------------------------------------

type enterpriseDepartmentRequest struct {
	Name     string `json:"name"`
	ParentId int    `json:"parent_id"`
	Sort     int    `json:"sort"`
}

func ListEnterpriseDepartments(c *gin.Context) {
	departments, err := model.ListEnterpriseDepartments(currentEnterprise(c).Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, departments)
}

func CreateEnterpriseDepartment(c *gin.Context) {
	var req enterpriseDepartmentRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	department := &model.EnterpriseDepartment{
		EnterpriseId: currentEnterprise(c).Id,
		ParentId:     req.ParentId,
		Name:         req.Name,
		Sort:         req.Sort,
	}
	if err := model.CreateEnterpriseDepartment(department); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, department)
}

func UpdateEnterpriseDepartment(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req enterpriseDepartmentRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	if err := model.UpdateEnterpriseDepartment(currentEnterprise(c).Id, id, req.Name, req.ParentId, req.Sort); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func DeleteEnterpriseDepartment(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	if err := model.DeleteEnterpriseDepartment(currentEnterprise(c).Id, id); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ---------------------------------------------------------------------------
// 员工
// ---------------------------------------------------------------------------

type enterpriseEmployeeRequest struct {
	DepartmentId int    `json:"department_id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	EmployeeNo   string `json:"employee_no"`
	Status       string `json:"status"`
	Remark       string `json:"remark"`
}

func (r enterpriseEmployeeRequest) toEmployee(enterpriseId int) *model.EnterpriseEmployee {
	return &model.EnterpriseEmployee{
		EnterpriseId: enterpriseId,
		DepartmentId: r.DepartmentId,
		Name:         r.Name,
		Email:        r.Email,
		EmployeeNo:   r.EmployeeNo,
		Status:       r.Status,
		Remark:       r.Remark,
	}
}

func ListEnterpriseEmployees(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := model.EnterpriseEmployeeFilter{
		DepartmentId: optionalIntQuery(c, "department_id"),
		Keyword:      c.Query("keyword"),
		Status:       c.Query("status"),
	}
	items, total, err := model.ListEnterpriseEmployees(currentEnterprise(c).Id, filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func CreateEnterpriseEmployee(c *gin.Context) {
	var req enterpriseEmployeeRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	employee := req.toEmployee(currentEnterprise(c).Id)
	if err := model.CreateEnterpriseEmployee(employee); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, employee)
}

func UpdateEnterpriseEmployee(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req enterpriseEmployeeRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	employee := req.toEmployee(currentEnterprise(c).Id)
	employee.Id = id
	if err := model.UpdateEnterpriseEmployee(employee); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func DeleteEnterpriseEmployee(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	if err := model.DeleteEnterpriseEmployee(currentEnterprise(c).Id, id); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ---------------------------------------------------------------------------
// 项目
// ---------------------------------------------------------------------------

type enterpriseProjectRequest struct {
	Name   string `json:"name"`
	Code   string `json:"code"`
	Status string `json:"status"`
	Remark string `json:"remark"`
}

func ListEnterpriseProjects(c *gin.Context) {
	projects, err := model.ListEnterpriseProjects(currentEnterprise(c).Id, c.Query("keyword"), c.Query("status"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, projects)
}

func CreateEnterpriseProject(c *gin.Context) {
	var req enterpriseProjectRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	project := &model.EnterpriseProject{
		EnterpriseId: currentEnterprise(c).Id,
		Name:         req.Name,
		Code:         req.Code,
		Status:       req.Status,
		Remark:       req.Remark,
	}
	if err := model.CreateEnterpriseProject(project); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, project)
}

func UpdateEnterpriseProject(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	var req enterpriseProjectRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	project := &model.EnterpriseProject{
		Id:           id,
		EnterpriseId: currentEnterprise(c).Id,
		Name:         req.Name,
		Code:         req.Code,
		Status:       req.Status,
		Remark:       req.Remark,
	}
	if err := model.UpdateEnterpriseProject(project); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func DeleteEnterpriseProject(c *gin.Context) {
	id, ok := paramId(c)
	if !ok {
		return
	}
	if err := model.DeleteEnterpriseProject(currentEnterprise(c).Id, id); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

type enterpriseTokenAssignmentRequest struct {
	EmployeeId int `json:"employee_id"`
	ProjectId  int `json:"project_id"`
}

type enterpriseTokenCreateRequest struct {
	Name           string `json:"name"`
	EmployeeId     int    `json:"employee_id"`
	ProjectId      int    `json:"project_id"`
	RemainQuota    int    `json:"remain_quota"`
	UnlimitedQuota bool   `json:"unlimited_quota"`
	ExpiredTime    int64  `json:"expired_time"`
}

func ListEnterpriseTokens(c *gin.Context) {
	enterprise := currentEnterprise(c)
	pageInfo := common.GetPageQuery(c)
	filter := model.EnterpriseTokenFilter{
		EmployeeId: optionalIntQuery(c, "employee_id"),
		ProjectId:  optionalIntQuery(c, "project_id"),
		Keyword:    c.Query("keyword"),
	}
	items, total, err := model.ListEnterpriseTokens(enterprise.Id, enterprise.UserId, filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

// CreateEnterpriseToken 为员工/项目创建 key。完整的 key 管理（模型限制、IP 白名单、查看明文等）沿用上游 API Key 页面
func CreateEnterpriseToken(c *gin.Context) {
	enterprise := currentEnterprise(c)
	var req enterpriseTokenCreateRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 50 {
		common.ApiErrorMsg(c, "key name is required and must be at most 50 characters")
		return
	}
	if !req.UnlimitedQuota && (req.RemainQuota < 0 || req.RemainQuota > maxTokenQuota()) {
		common.ApiErrorMsg(c, "invalid key quota")
		return
	}
	if req.ExpiredTime != -1 && req.ExpiredTime != 0 && req.ExpiredTime < common.GetTimestamp() {
		common.ApiErrorMsg(c, "expiration time must be in the future")
		return
	}
	if req.ExpiredTime == 0 {
		req.ExpiredTime = -1
	}
	count, err := model.CountUserTokens(enterprise.UserId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if maxTokens := operation_setting.GetMaxUserTokens(); int(count) >= maxTokens {
		common.ApiErrorMsg(c, "maximum number of API keys reached ("+strconv.Itoa(maxTokens)+")")
		return
	}
	key, err := common.GenerateKey()
	if err != nil {
		common.ApiErrorMsg(c, "failed to generate key")
		return
	}
	now := common.GetTimestamp()
	token := &model.Token{
		UserId:         enterprise.UserId,
		Name:           req.Name,
		Key:            key,
		CreatedTime:    now,
		AccessedTime:   now,
		ExpiredTime:    req.ExpiredTime,
		RemainQuota:    req.RemainQuota,
		UnlimitedQuota: req.UnlimitedQuota,
	}
	if err := model.CreateEnterpriseToken(enterprise.Id, token, req.EmployeeId, req.ProjectId); err != nil {
		enterpriseApiError(c, err)
		return
	}
	// 与上游一致：创建时只返回 id，明文 key 通过上游的"查看 key"接口获取
	common.ApiSuccess(c, gin.H{"id": token.Id})
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
	enterprise := currentEnterprise(c)
	if err := model.AssignEnterpriseToken(enterprise.Id, enterprise.UserId, id, req.EmployeeId, req.ProjectId); err != nil {
		enterpriseApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
