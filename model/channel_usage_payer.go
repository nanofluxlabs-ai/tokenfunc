package model

import "github.com/QuantumNous/new-api/common"

// ChannelUsagePayerProfile 渠道消耗明细里 Top 行付款主体的账户摘要：账号 / 企业 / 当前授信账期 / 订阅。
// 口径同财务中心「用户消耗」（fillFinanceUserProfiles），只是按 id 批量读、不带消费聚合。
type ChannelUsagePayerProfile struct {
	UserId          int
	Username        string
	Group           string
	Status          int
	RemainQuota     int
	IsEnterprise    bool
	EnterpriseName  string
	BillingMode     string
	CreditPeriod    *FinanceCreditPeriodView
	HasSubscription bool
}

// LoadChannelUsagePayerProfiles 按用户 id 批量装配账户摘要；不存在的用户不出现在结果里
func LoadChannelUsagePayerProfiles(userIds []int) (map[int]*ChannelUsagePayerProfile, error) {
	out := make(map[int]*ChannelUsagePayerProfile, len(userIds))
	if len(userIds) == 0 {
		return out, nil
	}
	type userScan struct {
		Id       int
		Username string
		Group    string
		Status   int
		Quota    int
	}
	users := make([]userScan, 0, len(userIds))
	// 多参数 Select 让 GORM 按字段引用列名，group 这类保留字由方言自动加引号
	if err := DB.Unscoped().Model(&User{}).Select("id", "username", "group", "status", "quota").Where("id IN ?", userIds).Scan(&users).Error; err != nil {
		return nil, err
	}
	for _, u := range users {
		out[u.Id] = &ChannelUsagePayerProfile{UserId: u.Id, Username: u.Username, Group: u.Group, Status: u.Status, RemainQuota: u.Quota}
	}

	enterprises := make([]Enterprise, 0)
	if err := DB.Where("user_id IN ?", userIds).Find(&enterprises).Error; err != nil {
		return nil, err
	}
	creditEnterpriseIds := make([]int, 0)
	profileByEnterprise := make(map[int]*ChannelUsagePayerProfile)
	for _, e := range enterprises {
		profile := out[e.UserId]
		if profile == nil {
			continue
		}
		profile.IsEnterprise = true
		profile.EnterpriseName = e.Name
		profile.BillingMode = e.BillingMode
		if e.BillingMode == EnterpriseBillingModeCredit {
			creditEnterpriseIds = append(creditEnterpriseIds, e.Id)
			profileByEnterprise[e.Id] = profile
		}
	}
	if len(creditEnterpriseIds) > 0 {
		periods := make([]EnterpriseCreditPeriod, 0)
		if err := DB.Where("enterprise_id IN ? AND status = ?", creditEnterpriseIds, EnterpriseCreditPeriodOpen).Find(&periods).Error; err != nil {
			return nil, err
		}
		for _, period := range periods {
			profileByEnterprise[period.EnterpriseId].CreditPeriod = &FinanceCreditPeriodView{
				PeriodNo: period.PeriodNo, LimitQuota: period.LimitQuota, UsedQuota: period.UsedQuota,
				StartAt: period.StartAt, EndAt: period.EndAt, Status: period.Status,
			}
		}
	}

	subscribedUserIds := make([]int, 0)
	if err := DB.Model(&UserSubscription{}).
		Where("user_id IN ? AND status = ? AND end_time > ?", userIds, "active", common.GetTimestamp()).
		Distinct("user_id").Pluck("user_id", &subscribedUserIds).Error; err != nil {
		return nil, err
	}
	for _, id := range subscribedUserIds {
		if profile := out[id]; profile != nil {
			profile.HasSubscription = true
		}
	}
	return out, nil
}
