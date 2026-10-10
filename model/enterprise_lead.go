package model

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"gorm.io/gorm"
)

// 试用申请状态
const (
	EnterpriseLeadStatusNew       = "new"
	EnterpriseLeadStatusContacted = "contacted"
	EnterpriseLeadStatusClosed    = "closed"
)

// 预计月用量档位（与营销页表单一致，服务端只接受枚举值）
var EnterpriseLeadVolumes = []string{"lt_1k", "1k_10k", "gt_10k"}

// EnterpriseTrialLead 营销页"申请企业试用"留资；匿名提交，由管理员跟进
type EnterpriseTrialLead struct {
	Id        int64  `json:"id"`
	Company   string `json:"company" gorm:"type:varchar(128);not null"`
	Contact   string `json:"contact" gorm:"type:varchar(128);not null"`
	Volume    string `json:"volume" gorm:"type:varchar(16);not null;default:''"`
	Status    string `json:"status" gorm:"type:varchar(16);not null;default:'new';index"`
	Remark    string `json:"remark" gorm:"type:text"`
	ClientIP  string `json:"client_ip" gorm:"type:varchar(64);not null;default:''"`
	CreatedAt int64  `json:"created_at" gorm:"not null;index"`
	UpdatedAt int64  `json:"updated_at" gorm:"not null;default:0"`
}

func (EnterpriseTrialLead) TableName() string { return "ent_trial_leads" }

var ErrEnterpriseLeadInvalid = errors.New("invalid trial lead")

var enterpriseLeadStatuses = []string{EnterpriseLeadStatusNew, EnterpriseLeadStatusContacted, EnterpriseLeadStatusClosed}

// CreateEnterpriseTrialLead 校验并保存留资
func CreateEnterpriseTrialLead(lead *EnterpriseTrialLead) error {
	lead.Company = strings.TrimSpace(lead.Company)
	lead.Contact = strings.TrimSpace(lead.Contact)
	if lead.Company == "" || len([]rune(lead.Company)) > 128 {
		return fmt.Errorf("%w: company is required (max 128 chars)", ErrEnterpriseLeadInvalid)
	}
	if len([]rune(lead.Contact)) < 5 || len([]rune(lead.Contact)) > 128 {
		return fmt.Errorf("%w: contact is required (5-128 chars)", ErrEnterpriseLeadInvalid)
	}
	if lead.Volume != "" && !slices.Contains(EnterpriseLeadVolumes, lead.Volume) {
		return fmt.Errorf("%w: unknown volume", ErrEnterpriseLeadInvalid)
	}
	lead.Status = EnterpriseLeadStatusNew
	lead.CreatedAt = time.Now().Unix()
	lead.UpdatedAt = lead.CreatedAt
	return DB.Create(lead).Error
}

// CountRecentEnterpriseTrialLeadsByIP 同一 IP 近 24 小时的提交次数，用于防刷
func CountRecentEnterpriseTrialLeadsByIP(ip string) (int64, error) {
	var count int64
	since := time.Now().Add(-24 * time.Hour).Unix()
	err := DB.Model(&EnterpriseTrialLead{}).
		Where("client_ip = ? AND created_at >= ?", ip, since).
		Count(&count).Error
	return count, err
}

// ListEnterpriseTrialLeads 管理员分页查看，status 为空表示全部
func ListEnterpriseTrialLeads(status string, offset, limit int) ([]EnterpriseTrialLead, int64, error) {
	query := DB.Model(&EnterpriseTrialLead{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var leads []EnterpriseTrialLead
	err := query.Order("id DESC").Offset(offset).Limit(limit).Find(&leads).Error
	return leads, total, err
}

// UpdateEnterpriseTrialLeadStatus 管理员更新跟进状态与备注
func UpdateEnterpriseTrialLeadStatus(id int64, status string, remark string) error {
	if !slices.Contains(enterpriseLeadStatuses, status) {
		return fmt.Errorf("%w: unknown status", ErrEnterpriseLeadInvalid)
	}
	result := DB.Model(&EnterpriseTrialLead{}).Where("id = ?", id).Updates(map[string]any{
		"status":     status,
		"remark":     strings.TrimSpace(remark),
		"updated_at": time.Now().Unix(),
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
