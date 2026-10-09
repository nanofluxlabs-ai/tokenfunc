package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// 员工状态
const (
	EnterpriseEmployeeStatusActive   = "active"
	EnterpriseEmployeeStatusDisabled = "disabled"
)

// 项目状态
const (
	EnterpriseProjectStatusActive   = "active"
	EnterpriseProjectStatusArchived = "archived"
)

// 部门树最大深度，防止异常数据导致无限向上追溯
const enterpriseDepartmentMaxDepth = 16

var (
	ErrEnterpriseResourceNotFound  = errors.New("resource not found in this enterprise")
	ErrEnterpriseDepartmentInUse   = errors.New("department still has sub-departments or employees")
	ErrEnterpriseDepartmentCycle   = errors.New("a department cannot be moved under itself or its descendants")
	ErrEnterpriseDuplicateName     = errors.New("name already exists")
	ErrEnterpriseEmployeeNotActive = errors.New("employee is disabled")
	ErrEnterpriseProjectArchived   = errors.New("project is archived")
)

// EnterpriseDepartment 部门（树形，parent_id=0 为顶级）
type EnterpriseDepartment struct {
	Id           int            `json:"id"`
	EnterpriseId int            `json:"enterprise_id" gorm:"not null;index:idx_ent_dept_parent,priority:1;uniqueIndex:uk_ent_dept_name,priority:1,where:deleted_at IS NULL"`
	ParentId     int            `json:"parent_id" gorm:"not null;default:0;index:idx_ent_dept_parent,priority:2;uniqueIndex:uk_ent_dept_name,priority:2,where:deleted_at IS NULL"`
	Name         string         `json:"name" gorm:"type:varchar(64);not null;uniqueIndex:uk_ent_dept_name,priority:3,where:deleted_at IS NULL"`
	Sort         int            `json:"sort" gorm:"not null;default:0"`
	CreatedAt    int64          `json:"created_at" gorm:"not null"`
	UpdatedAt    int64          `json:"updated_at" gorm:"not null"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

func (EnterpriseDepartment) TableName() string { return "ent_departments" }

// EnterpriseEmployee 员工（企业主账号下的子账号，不能登录，只通过分配的 API Key 调用）
type EnterpriseEmployee struct {
	Id           int            `json:"id"`
	EnterpriseId int            `json:"enterprise_id" gorm:"not null;index;uniqueIndex:uk_ent_employee_no,priority:1,where:employee_no <> '' AND deleted_at IS NULL"`
	DepartmentId int            `json:"department_id" gorm:"not null;default:0;index"`
	Name         string         `json:"name" gorm:"type:varchar(64);not null"`
	Email        string         `json:"email" gorm:"type:varchar(128);not null;default:''"`
	EmployeeNo   string         `json:"employee_no" gorm:"type:varchar(64);not null;default:'';uniqueIndex:uk_ent_employee_no,priority:2,where:employee_no <> '' AND deleted_at IS NULL"`
	Status       string         `json:"status" gorm:"type:varchar(16);not null"`
	Remark       string         `json:"remark" gorm:"type:text"`
	CreatedAt    int64          `json:"created_at" gorm:"not null"`
	UpdatedAt    int64          `json:"updated_at" gorm:"not null"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

func (EnterpriseEmployee) TableName() string { return "ent_employees" }

// EnterpriseProject 项目，仅用于消耗统计归因，不做额度拦截
type EnterpriseProject struct {
	Id           int            `json:"id"`
	EnterpriseId int            `json:"enterprise_id" gorm:"not null;index;uniqueIndex:uk_ent_project_name,priority:1,where:deleted_at IS NULL"`
	Name         string         `json:"name" gorm:"type:varchar(64);not null;uniqueIndex:uk_ent_project_name,priority:2,where:deleted_at IS NULL"`
	Code         string         `json:"code" gorm:"type:varchar(64);not null;default:''"`
	Status       string         `json:"status" gorm:"type:varchar(16);not null"`
	Remark       string         `json:"remark" gorm:"type:text"`
	CreatedAt    int64          `json:"created_at" gorm:"not null"`
	UpdatedAt    int64          `json:"updated_at" gorm:"not null"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

func (EnterpriseProject) TableName() string { return "ent_projects" }

// EnterpriseTokenAssignment API Key 的归属（员工 / 项目），独立成表以免给上游 tokens 表加列
type EnterpriseTokenAssignment struct {
	TokenId      int   `json:"token_id" gorm:"primaryKey;autoIncrement:false"`
	EnterpriseId int   `json:"enterprise_id" gorm:"not null;index"`
	EmployeeId   int   `json:"employee_id" gorm:"not null;default:0;index"`
	ProjectId    int   `json:"project_id" gorm:"not null;default:0;index"`
	CreatedAt    int64 `json:"created_at" gorm:"not null"`
	UpdatedAt    int64 `json:"updated_at" gorm:"not null"`
}

func (EnterpriseTokenAssignment) TableName() string { return "ent_token_assignments" }

// isUniqueViolation 判断 PG 唯一约束冲突（SQLSTATE 23505）
func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")
}

func normalizeEnterpriseName(name string, maxLen int) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > maxLen {
		return "", fmt.Errorf("name is required and must be at most %d characters", maxLen)
	}
	return name, nil
}

// ---------------------------------------------------------------------------
// 部门
// ---------------------------------------------------------------------------

func ListEnterpriseDepartments(enterpriseId int) ([]*EnterpriseDepartment, error) {
	departments := make([]*EnterpriseDepartment, 0)
	err := DB.Where("enterprise_id = ?", enterpriseId).Order("sort ASC, id ASC").Find(&departments).Error
	return departments, err
}

func getEnterpriseDepartment(tx *gorm.DB, enterpriseId int, id int) (*EnterpriseDepartment, error) {
	var department EnterpriseDepartment
	err := tx.Where("enterprise_id = ? AND id = ?", enterpriseId, id).First(&department).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &department, err
}

// ensureDepartmentParent 校验父部门属于本企业，且（移动时）不会形成环
func ensureDepartmentParent(tx *gorm.DB, enterpriseId int, departmentId int, parentId int) error {
	current := parentId
	for range enterpriseDepartmentMaxDepth {
		if current == 0 {
			return nil
		}
		if departmentId != 0 && current == departmentId {
			return ErrEnterpriseDepartmentCycle
		}
		parent, err := getEnterpriseDepartment(tx, enterpriseId, current)
		if err != nil {
			return err
		}
		current = parent.ParentId
	}
	return errors.New("department tree is too deep")
}

func CreateEnterpriseDepartment(department *EnterpriseDepartment) error {
	name, err := normalizeEnterpriseName(department.Name, 64)
	if err != nil {
		return err
	}
	department.Name = name
	if err := ensureDepartmentParent(DB, department.EnterpriseId, 0, department.ParentId); err != nil {
		return err
	}
	now := common.GetTimestamp()
	department.Id = 0
	department.CreatedAt = now
	department.UpdatedAt = now
	if err := DB.Create(department).Error; err != nil {
		if isUniqueViolation(err) {
			return ErrEnterpriseDuplicateName
		}
		return err
	}
	return nil
}

func UpdateEnterpriseDepartment(enterpriseId int, id int, name string, parentId int, sort int) error {
	name, err := normalizeEnterpriseName(name, 64)
	if err != nil {
		return err
	}
	if _, err := getEnterpriseDepartment(DB, enterpriseId, id); err != nil {
		return err
	}
	if err := ensureDepartmentParent(DB, enterpriseId, id, parentId); err != nil {
		return err
	}
	err = DB.Model(&EnterpriseDepartment{}).Where("enterprise_id = ? AND id = ?", enterpriseId, id).Updates(map[string]any{
		"name":       name,
		"parent_id":  parentId,
		"sort":       sort,
		"updated_at": common.GetTimestamp(),
	}).Error
	if isUniqueViolation(err) {
		return ErrEnterpriseDuplicateName
	}
	return err
}

// DeleteEnterpriseDepartment 软删除部门；仍有子部门或在职员工时拒绝
func DeleteEnterpriseDepartment(enterpriseId int, id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if _, err := getEnterpriseDepartment(lockForUpdate(tx), enterpriseId, id); err != nil {
			return err
		}
		var children, employees int64
		if err := tx.Model(&EnterpriseDepartment{}).Where("enterprise_id = ? AND parent_id = ?", enterpriseId, id).Count(&children).Error; err != nil {
			return err
		}
		if err := tx.Model(&EnterpriseEmployee{}).Where("enterprise_id = ? AND department_id = ?", enterpriseId, id).Count(&employees).Error; err != nil {
			return err
		}
		if children > 0 || employees > 0 {
			return ErrEnterpriseDepartmentInUse
		}
		return tx.Where("enterprise_id = ? AND id = ?", enterpriseId, id).Delete(&EnterpriseDepartment{}).Error
	})
}

// ---------------------------------------------------------------------------
// 员工
// ---------------------------------------------------------------------------

// EnterpriseEmployeeListItem 员工列表行：附带部门名与名下 key 数量
type EnterpriseEmployeeListItem struct {
	EnterpriseEmployee
	DepartmentName string `json:"department_name"`
	TokenCount     int    `json:"token_count"`
}

type EnterpriseEmployeeFilter struct {
	DepartmentId *int
	Keyword      string
	Status       string
}

func ListEnterpriseEmployees(enterpriseId int, filter EnterpriseEmployeeFilter, startIdx int, num int) ([]*EnterpriseEmployeeListItem, int64, error) {
	query := DB.Table("ent_employees").
		Where("ent_employees.enterprise_id = ? AND ent_employees.deleted_at IS NULL", enterpriseId)
	if filter.DepartmentId != nil {
		query = query.Where("ent_employees.department_id = ?", *filter.DepartmentId)
	}
	if filter.Status != "" {
		query = query.Where("ent_employees.status = ?", filter.Status)
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("(ent_employees.name ILIKE ? OR ent_employees.email ILIKE ? OR ent_employees.employee_no ILIKE ?)", like, like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]*EnterpriseEmployeeListItem, 0)
	err := query.
		Select(`ent_employees.*, COALESCE(d.name, '') AS department_name,
			(SELECT COUNT(*) FROM ent_token_assignments a JOIN tokens t ON t.id = a.token_id AND t.deleted_at IS NULL
			 WHERE a.employee_id = ent_employees.id) AS token_count`).
		Joins("LEFT JOIN ent_departments d ON d.id = ent_employees.department_id AND d.deleted_at IS NULL").
		Order("ent_employees.id DESC").
		Limit(num).Offset(startIdx).
		Scan(&items).Error
	return items, total, err
}

func getEnterpriseEmployee(tx *gorm.DB, enterpriseId int, id int) (*EnterpriseEmployee, error) {
	var employee EnterpriseEmployee
	err := tx.Where("enterprise_id = ? AND id = ?", enterpriseId, id).First(&employee).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &employee, err
}

func (e *EnterpriseEmployee) normalize() error {
	name, err := normalizeEnterpriseName(e.Name, 64)
	if err != nil {
		return err
	}
	e.Name = name
	e.Email = strings.TrimSpace(e.Email)
	e.EmployeeNo = strings.TrimSpace(e.EmployeeNo)
	if len(e.Email) > 128 || len(e.EmployeeNo) > 64 {
		return errors.New("email or employee number is too long")
	}
	if e.Status == "" {
		e.Status = EnterpriseEmployeeStatusActive
	}
	if e.Status != EnterpriseEmployeeStatusActive && e.Status != EnterpriseEmployeeStatusDisabled {
		return fmt.Errorf("invalid employee status: %s", e.Status)
	}
	return nil
}

func ensureEmployeeDepartment(tx *gorm.DB, enterpriseId int, departmentId int) error {
	if departmentId == 0 {
		return nil
	}
	_, err := getEnterpriseDepartment(tx, enterpriseId, departmentId)
	return err
}

func CreateEnterpriseEmployee(employee *EnterpriseEmployee) error {
	if err := employee.normalize(); err != nil {
		return err
	}
	if err := ensureEmployeeDepartment(DB, employee.EnterpriseId, employee.DepartmentId); err != nil {
		return err
	}
	now := common.GetTimestamp()
	employee.Id = 0
	employee.CreatedAt = now
	employee.UpdatedAt = now
	err := DB.Create(employee).Error
	if isUniqueViolation(err) {
		return ErrEnterpriseDuplicateName
	}
	return err
}

// disableEmployeeTokens 停用员工名下所有 key：先失效缓存（设置 fence）再写库，防止并发读者回填旧状态
func disableEmployeeTokens(tx *gorm.DB, enterpriseId int, employeeId int) error {
	var tokens []Token
	err := tx.Model(&Token{}).
		Select("tokens.id", "tokens."+commonKeyCol).
		Joins("JOIN ent_token_assignments a ON a.token_id = tokens.id").
		Where("a.enterprise_id = ? AND a.employee_id = ? AND tokens.status = ?", enterpriseId, employeeId, common.TokenStatusEnabled).
		Find(&tokens).Error
	if err != nil || len(tokens) == 0 {
		return err
	}
	if err := invalidateTokensCache(tokens); err != nil {
		common.SysLog("failed to invalidate employee token cache: " + err.Error())
	}
	ids := make([]int, 0, len(tokens))
	for _, token := range tokens {
		ids = append(ids, token.Id)
	}
	return tx.Model(&Token{}).Where("id IN ?", ids).Update("status", common.TokenStatusDisabled).Error
}

// UpdateEnterpriseEmployee 更新员工资料；状态改为停用时同步停用其名下全部 key（重新启用员工不会自动启用 key）
func UpdateEnterpriseEmployee(employee *EnterpriseEmployee) error {
	if err := employee.normalize(); err != nil {
		return err
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		existing, err := getEnterpriseEmployee(lockForUpdate(tx), employee.EnterpriseId, employee.Id)
		if err != nil {
			return err
		}
		if err := ensureEmployeeDepartment(tx, employee.EnterpriseId, employee.DepartmentId); err != nil {
			return err
		}
		err = tx.Model(&EnterpriseEmployee{}).Where("id = ?", employee.Id).Updates(map[string]any{
			"department_id": employee.DepartmentId,
			"name":          employee.Name,
			"email":         employee.Email,
			"employee_no":   employee.EmployeeNo,
			"status":        employee.Status,
			"remark":        employee.Remark,
			"updated_at":    common.GetTimestamp(),
		}).Error
		if isUniqueViolation(err) {
			return ErrEnterpriseDuplicateName
		}
		if err != nil {
			return err
		}
		if existing.Status == EnterpriseEmployeeStatusActive && employee.Status == EnterpriseEmployeeStatusDisabled {
			return disableEmployeeTokens(tx, employee.EnterpriseId, employee.Id)
		}
		return nil
	})
}

// DeleteEnterpriseEmployee 软删除员工并停用其名下 key；key 归属保留，历史统计不受影响
func DeleteEnterpriseEmployee(enterpriseId int, id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if _, err := getEnterpriseEmployee(lockForUpdate(tx), enterpriseId, id); err != nil {
			return err
		}
		if err := disableEmployeeTokens(tx, enterpriseId, id); err != nil {
			return err
		}
		return tx.Where("enterprise_id = ? AND id = ?", enterpriseId, id).Delete(&EnterpriseEmployee{}).Error
	})
}

// ---------------------------------------------------------------------------
// 项目
// ---------------------------------------------------------------------------

type EnterpriseProjectListItem struct {
	EnterpriseProject
	TokenCount int `json:"token_count"`
}

func ListEnterpriseProjects(enterpriseId int, keyword string, status string) ([]*EnterpriseProjectListItem, error) {
	query := DB.Table("ent_projects").
		Where("ent_projects.enterprise_id = ? AND ent_projects.deleted_at IS NULL", enterpriseId)
	if status != "" {
		query = query.Where("ent_projects.status = ?", status)
	}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("(ent_projects.name ILIKE ? OR ent_projects.code ILIKE ?)", like, like)
	}
	items := make([]*EnterpriseProjectListItem, 0)
	err := query.
		Select(`ent_projects.*,
			(SELECT COUNT(*) FROM ent_token_assignments a JOIN tokens t ON t.id = a.token_id AND t.deleted_at IS NULL
			 WHERE a.project_id = ent_projects.id) AS token_count`).
		Order("ent_projects.id DESC").
		Scan(&items).Error
	return items, err
}

func getEnterpriseProject(tx *gorm.DB, enterpriseId int, id int) (*EnterpriseProject, error) {
	var project EnterpriseProject
	err := tx.Where("enterprise_id = ? AND id = ?", enterpriseId, id).First(&project).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEnterpriseResourceNotFound
	}
	return &project, err
}

func (p *EnterpriseProject) normalize() error {
	name, err := normalizeEnterpriseName(p.Name, 64)
	if err != nil {
		return err
	}
	p.Name = name
	p.Code = strings.TrimSpace(p.Code)
	if len(p.Code) > 64 {
		return errors.New("project code is too long")
	}
	if p.Status == "" {
		p.Status = EnterpriseProjectStatusActive
	}
	if p.Status != EnterpriseProjectStatusActive && p.Status != EnterpriseProjectStatusArchived {
		return fmt.Errorf("invalid project status: %s", p.Status)
	}
	return nil
}

func CreateEnterpriseProject(project *EnterpriseProject) error {
	if err := project.normalize(); err != nil {
		return err
	}
	now := common.GetTimestamp()
	project.Id = 0
	project.CreatedAt = now
	project.UpdatedAt = now
	err := DB.Create(project).Error
	if isUniqueViolation(err) {
		return ErrEnterpriseDuplicateName
	}
	return err
}

func UpdateEnterpriseProject(project *EnterpriseProject) error {
	if err := project.normalize(); err != nil {
		return err
	}
	if _, err := getEnterpriseProject(DB, project.EnterpriseId, project.Id); err != nil {
		return err
	}
	err := DB.Model(&EnterpriseProject{}).Where("enterprise_id = ? AND id = ?", project.EnterpriseId, project.Id).Updates(map[string]any{
		"name":       project.Name,
		"code":       project.Code,
		"status":     project.Status,
		"remark":     project.Remark,
		"updated_at": common.GetTimestamp(),
	}).Error
	if isUniqueViolation(err) {
		return ErrEnterpriseDuplicateName
	}
	return err
}

// DeleteEnterpriseProject 软删除项目；key 上的项目归属保留，历史统计不受影响
func DeleteEnterpriseProject(enterpriseId int, id int) error {
	if _, err := getEnterpriseProject(DB, enterpriseId, id); err != nil {
		return err
	}
	return DB.Where("enterprise_id = ? AND id = ?", enterpriseId, id).Delete(&EnterpriseProject{}).Error
}

// ---------------------------------------------------------------------------
// API Key 归属
// ---------------------------------------------------------------------------

// EnterpriseTokenListItem 企业 key 列表行（key 只返回脱敏值）
type EnterpriseTokenListItem struct {
	Id             int    `json:"id"`
	Name           string `json:"name"`
	Key            string `json:"key" gorm:"column:token_key"`
	Status         int    `json:"status"`
	RemainQuota    int    `json:"remain_quota"`
	UnlimitedQuota bool   `json:"unlimited_quota"`
	UsedQuota      int    `json:"used_quota"`
	ExpiredTime    int64  `json:"expired_time"`
	CreatedTime    int64  `json:"created_time"`
	AccessedTime   int64  `json:"accessed_time"`
	EmployeeId     int    `json:"employee_id"`
	EmployeeName   string `json:"employee_name"`
	DepartmentName string `json:"department_name"`
	ProjectId      int    `json:"project_id"`
	ProjectName    string `json:"project_name"`
}

type EnterpriseTokenFilter struct {
	EmployeeId *int
	ProjectId  *int
	Keyword    string
}

func ListEnterpriseTokens(enterpriseId int, ownerUserId int, filter EnterpriseTokenFilter, startIdx int, num int) ([]*EnterpriseTokenListItem, int64, error) {
	query := DB.Table("tokens").
		Joins("LEFT JOIN ent_token_assignments a ON a.token_id = tokens.id AND a.enterprise_id = ?", enterpriseId).
		Joins("LEFT JOIN ent_employees e ON e.id = a.employee_id").
		Joins("LEFT JOIN ent_departments d ON d.id = e.department_id AND d.deleted_at IS NULL").
		Joins("LEFT JOIN ent_projects p ON p.id = a.project_id").
		Where("tokens.user_id = ? AND tokens.deleted_at IS NULL", ownerUserId)
	if filter.EmployeeId != nil {
		query = query.Where("COALESCE(a.employee_id, 0) = ?", *filter.EmployeeId)
	}
	if filter.ProjectId != nil {
		query = query.Where("COALESCE(a.project_id, 0) = ?", *filter.ProjectId)
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("(tokens.name ILIKE ? OR e.name ILIKE ? OR p.name ILIKE ?)", like, like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]*EnterpriseTokenListItem, 0)
	err := query.
		Select(`tokens.id, tokens.name, tokens.` + commonKeyCol + ` AS token_key, tokens.status, tokens.remain_quota,
			tokens.unlimited_quota, tokens.used_quota, tokens.expired_time, tokens.created_time, tokens.accessed_time,
			COALESCE(a.employee_id, 0) AS employee_id, COALESCE(e.name, '') AS employee_name,
			COALESCE(d.name, '') AS department_name,
			COALESCE(a.project_id, 0) AS project_id, COALESCE(p.name, '') AS project_name`).
		Order("tokens.id DESC").
		Limit(num).Offset(startIdx).
		Scan(&items).Error
	if err != nil {
		return nil, 0, err
	}
	for _, item := range items {
		item.Key = MaskTokenKey(item.Key)
	}
	return items, total, nil
}

// validateTokenAssignmentTargets 校验员工/项目属于本企业且可分配（停用员工、归档项目不能再分配新 key）
func validateTokenAssignmentTargets(tx *gorm.DB, enterpriseId int, employeeId int, projectId int) error {
	if employeeId != 0 {
		employee, err := getEnterpriseEmployee(tx, enterpriseId, employeeId)
		if err != nil {
			return err
		}
		if employee.Status != EnterpriseEmployeeStatusActive {
			return ErrEnterpriseEmployeeNotActive
		}
	}
	if projectId != 0 {
		project, err := getEnterpriseProject(tx, enterpriseId, projectId)
		if err != nil {
			return err
		}
		if project.Status != EnterpriseProjectStatusActive {
			return ErrEnterpriseProjectArchived
		}
	}
	return nil
}

func upsertTokenAssignment(tx *gorm.DB, enterpriseId int, tokenId int, employeeId int, projectId int) error {
	if employeeId == 0 && projectId == 0 {
		return tx.Where("token_id = ?", tokenId).Delete(&EnterpriseTokenAssignment{}).Error
	}
	now := common.GetTimestamp()
	assignment := EnterpriseTokenAssignment{
		TokenId:      tokenId,
		EnterpriseId: enterpriseId,
		EmployeeId:   employeeId,
		ProjectId:    projectId,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "token_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"enterprise_id", "employee_id", "project_id", "updated_at"}),
	}).Create(&assignment).Error
}

// AssignEnterpriseToken 修改 key 的员工/项目归属，只影响之后的请求统计
func AssignEnterpriseToken(enterpriseId int, ownerUserId int, tokenId int, employeeId int, projectId int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&Token{}).Where("id = ? AND user_id = ?", tokenId, ownerUserId).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return ErrEnterpriseResourceNotFound
		}
		if err := validateTokenAssignmentTargets(tx, enterpriseId, employeeId, projectId); err != nil {
			return err
		}
		return upsertTokenAssignment(tx, enterpriseId, tokenId, employeeId, projectId)
	})
}

// CreateEnterpriseToken 为企业主账号创建 key 并写入归属（同一事务）
func CreateEnterpriseToken(enterpriseId int, token *Token, employeeId int, projectId int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := validateTokenAssignmentTargets(tx, enterpriseId, employeeId, projectId); err != nil {
			return err
		}
		if err := tx.Create(token).Error; err != nil {
			return err
		}
		return upsertTokenAssignment(tx, enterpriseId, token.Id, employeeId, projectId)
	})
}

// ---------------------------------------------------------------------------
// 员工批量导入
// ---------------------------------------------------------------------------

const EnterpriseEmployeeImportMaxRows = 1000

// EnterpriseEmployeeImportRow 导入的一行；Department 按名称匹配已有部门，找不到则新建为顶级部门
type EnterpriseEmployeeImportRow struct {
	Name       string `json:"name"`
	Email      string `json:"email"`
	EmployeeNo string `json:"employee_no"`
	Department string `json:"department"`
}

// EnterpriseEmployeeImportError 行级错误，Row 从 1 开始计数
type EnterpriseEmployeeImportError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

type EnterpriseEmployeeImportResult struct {
	Created            int                             `json:"created"`
	CreatedDepartments []string                        `json:"created_departments"`
	Errors             []EnterpriseEmployeeImportError `json:"errors"`
}

// ImportEnterpriseEmployees 批量导入员工：先整体校验，任一行有错则全部不写入（全成功或全失败）
func ImportEnterpriseEmployees(enterpriseId int, rows []EnterpriseEmployeeImportRow) (*EnterpriseEmployeeImportResult, error) {
	result := &EnterpriseEmployeeImportResult{CreatedDepartments: []string{}, Errors: []EnterpriseEmployeeImportError{}}
	if len(rows) == 0 {
		return result, errors.New("no rows to import")
	}
	if len(rows) > EnterpriseEmployeeImportMaxRows {
		return result, fmt.Errorf("at most %d rows per import", EnterpriseEmployeeImportMaxRows)
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var departments []EnterpriseDepartment
		if err := tx.Where("enterprise_id = ?", enterpriseId).Order("sort ASC, id ASC").Find(&departments).Error; err != nil {
			return err
		}
		departmentIds := map[string]int{}
		for _, department := range departments {
			key := strings.ToLower(department.Name)
			if _, exists := departmentIds[key]; !exists {
				departmentIds[key] = department.Id
			}
		}
		var existingNos []string
		if err := tx.Model(&EnterpriseEmployee{}).Where("enterprise_id = ? AND employee_no <> ''", enterpriseId).Pluck("employee_no", &existingNos).Error; err != nil {
			return err
		}
		usedNos := map[string]bool{}
		for _, no := range existingNos {
			usedNos[no] = true
		}

		employees := make([]*EnterpriseEmployee, 0, len(rows))
		departmentKeys := make([]string, 0, len(rows)) // 与 employees 一一对应的部门键（小写名），空表示未分配
		newDepartments := map[string]string{}          // 小写名 -> 原始名
		for i, row := range rows {
			employee := &EnterpriseEmployee{
				EnterpriseId: enterpriseId,
				Name:         row.Name,
				Email:        row.Email,
				EmployeeNo:   row.EmployeeNo,
				Status:       EnterpriseEmployeeStatusActive,
			}
			if err := employee.normalize(); err != nil {
				result.Errors = append(result.Errors, EnterpriseEmployeeImportError{Row: i + 1, Message: err.Error()})
				continue
			}
			if employee.EmployeeNo != "" {
				if usedNos[employee.EmployeeNo] {
					result.Errors = append(result.Errors, EnterpriseEmployeeImportError{Row: i + 1, Message: "duplicate employee number: " + employee.EmployeeNo})
					continue
				}
				usedNos[employee.EmployeeNo] = true
			}
			departmentKey := ""
			if departmentName := strings.TrimSpace(row.Department); departmentName != "" {
				if len([]rune(departmentName)) > 64 {
					result.Errors = append(result.Errors, EnterpriseEmployeeImportError{Row: i + 1, Message: "department name is too long"})
					continue
				}
				departmentKey = strings.ToLower(departmentName)
				if _, exists := departmentIds[departmentKey]; !exists {
					if _, pending := newDepartments[departmentKey]; !pending {
						newDepartments[departmentKey] = departmentName // 首次出现的写法作为部门名
					}
				}
			}
			employees = append(employees, employee)
			departmentKeys = append(departmentKeys, departmentKey)
		}
		if len(result.Errors) > 0 {
			return errImportRejected
		}

		now := common.GetTimestamp()
		for key, name := range newDepartments {
			department := &EnterpriseDepartment{EnterpriseId: enterpriseId, Name: name, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(department).Error; err != nil {
				return err
			}
			departmentIds[key] = department.Id
			result.CreatedDepartments = append(result.CreatedDepartments, name)
		}
		for i, employee := range employees {
			if departmentKeys[i] != "" {
				employee.DepartmentId = departmentIds[departmentKeys[i]]
			}
			employee.CreatedAt = now
			employee.UpdatedAt = now
		}
		if err := tx.Create(&employees).Error; err != nil {
			return err
		}
		result.Created = len(employees)
		return nil
	})
	if errors.Is(err, errImportRejected) {
		return result, nil
	}
	return result, err
}

// errImportRejected 用于回滚事务：行校验失败时不写入任何数据
var errImportRejected = errors.New("import rejected")
