package main

import (
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// 企业：授信（自然月）大客户 acme、预付 globex、授信（固定 30 天）initech、已停用的 umbrella。
// 组织结构走 model 层函数建，保证默认团队、归属、角色这些不变量；时间戳事后回溯。

type demoEnterprise struct {
	Key   string
	Owner *model.User
	Ent   *model.Enterprise
	Plan  *accountPlan
	Teams map[string]*model.EnterpriseTeam
	// Periods 授信企业的账期，按开始时间升序；最后一期是 open
	Periods []*model.EnterpriseCreditPeriod
	// BudgetFill 团队名 → 本月预算使用率目标（出数后按实际用量反推预算）
	BudgetFill map[string]float64
	// Policies 周期限额 key（出数后按本周期实际用量设额度）
	Policies []tokenPolicyPlan
	// LoginUsers 角色 → 开通的成员登录账号 user_id（审计日志的操作者）
	LoginUsers map[string]int
}

type tokenPolicyPlan struct {
	TokenId int
	Period  string
	// Fill 本周期已用 / 周期额度；>= 1 表示已耗尽
	Fill float64
}

type teamSpec struct {
	Name       string
	Mix        modelMix
	Members    int
	BudgetFill float64 // 0 表示不设预算
	Enforce    bool
}

type teamKeySpec struct {
	Team         string
	Name         string
	Weight       float64
	Mix          modelMix
	UntilDaysAgo float64
	Status       int
}

type enterpriseSpec struct {
	Key, Username, Name, Display string
	BillingMode                  string
	CycleType                    string
	CycleDays                    int
	AnchorDaysAfterStart         int
	PaymentTermsDays             int
	Status                       string
	Daily, PromptScale, Weekend  float64
	StartGrowth                  float64
	Teams                        []teamSpec
	TeamKeys                     []teamKeySpec
	ArchivedTeam                 string
	// NoTraffic 只建组织不出流量（已停用企业）
	NoTraffic bool
	Profile   model.EnterpriseBillingProfile
}

var enterpriseSpecs = []enterpriseSpec{
	{
		Key: "acme", Username: "demo_acme", Name: "Acme 智能科技有限公司", Display: "Acme 管理员",
		BillingMode: model.EnterpriseBillingModeCredit, CycleType: model.EnterpriseCreditCycleNaturalMonth, PaymentTermsDays: 30,
		Daily: 1150, PromptScale: 10, Weekend: 0.3, StartGrowth: 0.5,
		Teams: []teamSpec{
			{Name: "研发平台", Mix: mixCoding, Members: 7, BudgetFill: 0.64},
			{Name: "算法研究", Mix: mixMixed, Members: 5, BudgetFill: 0.91},
			{Name: "智能客服", Mix: mixApp, Members: 4, BudgetFill: 1.07},
			{Name: "产品设计", Mix: mixLight, Members: 3},
			{Name: "市场增长", Mix: mixApp, Members: 3, BudgetFill: 0.45, Enforce: true},
		},
		TeamKeys: []teamKeySpec{
			{Team: "研发平台", Name: "CI 流水线", Weight: 9, Mix: mixCoding},
			{Team: "智能客服", Name: "客服机器人-生产", Weight: 16, Mix: mixApp},
			{Team: "智能客服", Name: "客服机器人-预发", Weight: 3, Mix: mixApp, UntilDaysAgo: 6, Status: common.TokenStatusDisabled},
			{Team: "2025 黑客松", Name: "黑客松 Demo", Weight: 4, Mix: mixMixed, UntilDaysAgo: 48},
		},
		ArchivedTeam: "2025 黑客松",
		Profile: model.EnterpriseBillingProfile{CompanyName: "Acme 智能科技有限公司", Address: "上海市浦东新区张江路 88 号",
			TaxId: "91310000DEMO0001X", BillingEmail: "finance@acme.demo", Phone: "021-60000001", Country: "CN"},
	},
	{
		Key: "globex", Username: "demo_globex", Name: "Globex 数据服务", Display: "Globex 管理员",
		BillingMode: model.EnterpriseBillingModePrepaid, PaymentTermsDays: 15,
		Daily: 300, PromptScale: 8, Weekend: 0.5, StartGrowth: 0.7,
		Teams: []teamSpec{
			{Name: "数据平台", Mix: mixMixed, Members: 4, BudgetFill: 0.72},
			{Name: "运营", Mix: mixApp, Members: 2},
		},
		TeamKeys: []teamKeySpec{{Team: "数据平台", Name: "ETL 任务", Weight: 5, Mix: mixLight}},
		Profile: model.EnterpriseBillingProfile{CompanyName: "Globex Data Services Pte. Ltd.", Address: "10 Anson Road, Singapore",
			TaxId: "SG-DEMO-2002", BillingEmail: "ap@globex.demo", Phone: "+65 6000 2002", Country: "SG"},
	},
	{
		Key: "initech", Username: "demo_initech", Name: "Initech 软件", Display: "Initech 管理员",
		BillingMode: model.EnterpriseBillingModeCredit, CycleType: model.EnterpriseCreditCycleFixedDays, CycleDays: 30,
		AnchorDaysAfterStart: 9, PaymentTermsDays: 15,
		Daily: 120, PromptScale: 7, Weekend: 0.45, StartGrowth: 0.85,
		Teams: []teamSpec{{Name: "AI 实验室", Mix: mixCoding, Members: 3}},
		Profile: model.EnterpriseBillingProfile{CompanyName: "Initech Software Inc.", Address: "500 Demo Ave, Austin, TX",
			TaxId: "US-DEMO-3003", BillingEmail: "billing@initech.demo", Phone: "+1 512 000 3003", Country: "US"},
	},
	{
		Key: "umbrella", Username: "demo_umbrella", Name: "Umbrella 生物", Display: "Umbrella 管理员",
		BillingMode: model.EnterpriseBillingModePrepaid, PaymentTermsDays: 15, Status: model.EnterpriseStatusSuspended,
		Teams: []teamSpec{{Name: "研究院", Mix: mixLight, Members: 2}}, NoTraffic: true,
	},
}

func (s *seeder) createEnterprises() error {
	personIdx := 0
	for _, spec := range enterpriseSpecs {
		ent, err := s.createEnterprise(spec, &personIdx)
		if err != nil {
			return fmt.Errorf("%s: %w", spec.Key, err)
		}
		s.enterprises = append(s.enterprises, ent)
		if !spec.NoTraffic {
			s.plans = append(s.plans, ent.Plan)
		}
	}
	return nil
}

func (s *seeder) createEnterprise(spec enterpriseSpec, personIdx *int) (*demoEnterprise, error) {
	onboarded := s.start.Unix() - 3*86400
	if spec.NoTraffic {
		onboarded = s.daysAgo(20)
	}
	owner := &model.User{Username: spec.Username, Password: demoPassword, DisplayName: spec.Display,
		Email: spec.Key + "-owner" + demoLeadEmailSuffix, Status: common.UserStatusEnabled, Group: "default"}
	ent := &model.Enterprise{Name: spec.Name, ContactName: spec.Display, ContactEmail: spec.Profile.BillingEmail,
		ContactPhone: spec.Profile.Phone, BillingMode: spec.BillingMode, CreditCycleType: spec.CycleType, CreditCycleDays: spec.CycleDays,
		CreditAlertPercent: model.EnterpriseDefaultCreditAlertPercent, PaymentTermsDays: spec.PaymentTermsDays,
		BillingProfile: spec.Profile, Status: spec.Status, MaxTokens: 100}
	if err := model.CreateEnterpriseWithNewUser(owner, ent); err != nil {
		return nil, err
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", owner.Id).Update("created_at", onboarded).Error; err != nil {
		return nil, err
	}
	if err := model.DB.Model(&model.Enterprise{}).Where("id = ?", ent.Id).Updates(map[string]any{"created_at": onboarded, "updated_at": onboarded}).Error; err != nil {
		return nil, err
	}
	s.logins = append(s.logins, loginInfo{Role: spec.Name + " 企业主", Username: owner.Username})

	demo := &demoEnterprise{Key: spec.Key, Owner: owner, Ent: ent, Teams: map[string]*model.EnterpriseTeam{}, BudgetFill: map[string]float64{},
		LoginUsers: map[string]int{}}
	demo.Plan = &accountPlan{UserId: owner.Id, Username: owner.Username, Group: owner.Group, DailyRequests: spec.Daily,
		PromptScale: spec.PromptScale, WeekendFactor: spec.Weekend, StartGrowth: spec.StartGrowth, EnterpriseId: ent.Id, BillingSource: "wallet"}

	var defaultTeam model.EnterpriseTeam
	if err := model.DB.Where("enterprise_id = ? AND is_default", ent.Id).First(&defaultTeam).Error; err != nil {
		return nil, err
	}
	demo.Teams[defaultTeam.Name] = &defaultTeam
	teamSpecs := append([]teamSpec{}, spec.Teams...)
	if spec.ArchivedTeam != "" {
		teamSpecs = append(teamSpecs, teamSpec{Name: spec.ArchivedTeam})
	}
	for i, ts := range teamSpecs {
		team := &model.EnterpriseTeam{EnterpriseId: ent.Id, Name: ts.Name, Sort: i + 1, BudgetAlertPercent: 80, BudgetEnforce: ts.Enforce}
		if err := model.CreateEnterpriseTeam(team); err != nil {
			return nil, err
		}
		demo.Teams[ts.Name] = team
		if ts.BudgetFill > 0 {
			demo.BudgetFill[ts.Name] = ts.BudgetFill
		}
	}

	// 账期先建好：流量生成时按请求时间归期
	if spec.BillingMode == model.EnterpriseBillingModeCredit {
		if err := s.createCreditPeriods(demo, spec); err != nil {
			return nil, err
		}
	}

	// 成员 + 各自的 key；每家企业的第 1 / 2 个成员分别开企业管理员、开发者登录，第二个团队的第 1 个成员开团队管理员
	trafficFrom := s.start.Unix()
	if len(demo.Periods) > 0 {
		trafficFrom = demo.Periods[0].StartAt
	}
	memberSeq := 0
	var disabledMember *model.EnterpriseMember
	for teamIdx, ts := range spec.Teams {
		team := demo.Teams[ts.Name]
		for m := range ts.Members {
			person := demoPeople[*personIdx%len(demoPeople)]
			*personIdx++
			memberSeq++
			member := &model.EnterpriseMember{EnterpriseId: ent.Id, TeamId: team.Id, Name: person.Name,
				Email: person.Email + "@" + spec.Key + ".demo", EmployeeNo: fmt.Sprintf("E%d%03d", 1+teamIdx, memberSeq)}
			if err := model.CreateEnterpriseMember(member); err != nil {
				return nil, err
			}
			role := ""
			switch {
			case teamIdx == 0 && m == 0:
				role = model.EnterpriseMemberRoleEnterpriseAdmin
			case teamIdx == 0 && m == 1:
				role = model.EnterpriseMemberRoleDeveloper
			case teamIdx == 1 && m == 0:
				role = model.EnterpriseMemberRoleTeamAdmin
			}
			if role != "" && !spec.NoTraffic {
				if err := s.provisionLogin(demo, member, role); err != nil {
					return nil, err
				}
			}
			stream := &tokenStream{TokenName: person.Name + " 的 key", Weight: logNormal(s.rng, 0.7) * 3, Mix: ts.Mix, TeamId: team.Id, MemberId: member.Id, ActiveFrom: trafficFrom}
			// 新入职：部分成员的 key 晚建
			if memberSeq%6 == 5 {
				stream.ActiveFrom = s.daysAgo(float64(14 + s.rng.IntN(40)))
			}
			token := &model.Token{UserId: owner.Id, Name: stream.TokenName, Key: newDemoKey(), Status: common.TokenStatusEnabled,
				ExpiredTime: -1, UnlimitedQuota: true, CreatedTime: stream.ActiveFrom - 600, AllowUserQuotaQuery: true}
			policy := s.applyKeyVariant(spec, memberSeq, stream, token)
			if err := model.CreateEnterpriseToken(ent.Id, model.EnterpriseScope{}, token, team.Id, member.Id); err != nil {
				return nil, err
			}
			stream.TokenId = token.Id
			if policy != nil {
				policy.TokenId = token.Id
				demo.Policies = append(demo.Policies, *policy)
			}
			demo.Plan.Streams = append(demo.Plan.Streams, stream)
			if spec.Key == "acme" && teamIdx == len(spec.Teams)-1 && m == ts.Members-1 {
				disabledMember = member
				stream.ActiveUntil = s.daysAgo(20)
			}
			if err := backdate(&model.EnterpriseMember{}, member.Id, stream.ActiveFrom-3600); err != nil {
				return nil, err
			}
		}
	}
	for _, key := range spec.TeamKeys {
		team := demo.Teams[key.Team]
		stream := &tokenStream{TokenName: key.Name, Weight: key.Weight, Mix: key.Mix, TeamId: team.Id, ActiveFrom: trafficFrom}
		if key.UntilDaysAgo > 0 {
			stream.ActiveUntil = s.daysAgo(key.UntilDaysAgo)
		}
		status := key.Status
		if status == 0 {
			status = common.TokenStatusEnabled
		}
		token := &model.Token{UserId: owner.Id, Name: key.Name, Key: newDemoKey(), Status: status, ExpiredTime: -1,
			UnlimitedQuota: true, CreatedTime: trafficFrom - 600, AllowUserQuotaQuery: true}
		if err := model.CreateEnterpriseToken(ent.Id, model.EnterpriseScope{}, token, team.Id, 0); err != nil {
			return nil, err
		}
		stream.TokenId = token.Id
		demo.Plan.Streams = append(demo.Plan.Streams, stream)
	}
	if spec.ArchivedTeam != "" {
		if err := model.ArchiveEnterpriseTeam(ent.Id, demo.Teams[spec.ArchivedTeam].Id); err != nil {
			return nil, err
		}
	}
	if disabledMember != nil {
		disabledMember.Status = model.EnterpriseMemberStatusDisabled
		if err := model.UpdateEnterpriseMember(disabledMember); err != nil {
			return nil, err
		}
	}
	for _, team := range demo.Teams {
		if err := model.DB.Model(&model.EnterpriseTeam{}).Where("id = ?", team.Id).Updates(map[string]any{"created_at": onboarded, "updated_at": onboarded}).Error; err != nil {
			return nil, err
		}
	}
	if len(demo.Periods) > 0 {
		periods := demo.Periods
		demo.Plan.BillingSource = "credit"
		demo.Plan.PeriodOf = func(ts int64) int64 {
			idx := sort.Search(len(periods), func(i int) bool { return periods[i].StartAt > ts }) - 1
			return periods[max(idx, 0)].Id
		}
	}
	return demo, nil
}

// applyKeyVariant 让 acme 的 key 覆盖各种状态：即将过期、已过期、周期限额（含已耗尽）；返回要挂的限额策略
func (s *seeder) applyKeyVariant(spec enterpriseSpec, seq int, stream *tokenStream, token *model.Token) *tokenPolicyPlan {
	if spec.Key != "acme" {
		return nil
	}
	switch seq {
	case 3:
		token.ExpiredTime = s.daysAgo(-3)
	case 9:
		token.ExpiredTime = s.daysAgo(-6)
	case 19:
		token.ExpiredTime = s.daysAgo(15)
		token.Status = common.TokenStatusExpired
		stream.ActiveUntil = token.ExpiredTime
	}
	policies := map[int]tokenPolicyPlan{
		2: {Period: model.TokenQuotaResetDaily, Fill: 0.55}, 4: {Period: model.TokenQuotaResetDaily, Fill: 1},
		6: {Period: model.TokenQuotaResetDaily, Fill: 0.3}, 8: {Period: model.TokenQuotaResetWeekly, Fill: 0.82},
		11: {Period: model.TokenQuotaResetWeekly, Fill: 0.4}, 13: {Period: model.TokenQuotaResetMonthly, Fill: 0.68},
		15: {Period: model.TokenQuotaResetMonthly, Fill: 0.2}, 17: {Period: model.TokenQuotaResetMonthly, Fill: 0.93},
	}
	plan, ok := policies[seq]
	if !ok {
		return nil
	}
	return &plan
}

func (s *seeder) provisionLogin(demo *demoEnterprise, member *model.EnterpriseMember, role string) error {
	login, err := model.ProvisionEnterpriseMemberLogin(demo.Ent.Id, member.Id, role)
	if err != nil {
		return err
	}
	hash, err := common.HashAccountPassword(demoPassword)
	if err != nil {
		return err
	}
	// 开通账号的用户名带企业 / 成员 id，每次重灌都会变；改成固定的 demo_<企业>_<角色> 方便记
	username := demo.Owner.Username + "_" + roleSuffix[role]
	if err := model.DB.Model(&model.User{}).Where("id = ?", login.UserId).Updates(map[string]any{
		"username": username, "password": hash, "created_at": s.start.Unix(),
	}).Error; err != nil {
		return err
	}
	demo.LoginUsers[role] = login.UserId
	s.logins = append(s.logins, loginInfo{Role: demo.Ent.Name + " " + roleLabel(role) + "（" + member.Name + "）", Username: username})
	return nil
}

var roleSuffix = map[string]string{
	model.EnterpriseMemberRoleEnterpriseAdmin: "admin",
	model.EnterpriseMemberRoleTeamAdmin:       "lead",
	model.EnterpriseMemberRoleDeveloper:       "dev",
}

func roleLabel(role string) string {
	switch role {
	case model.EnterpriseMemberRoleEnterpriseAdmin:
		return "企业管理员"
	case model.EnterpriseMemberRoleTeamAdmin:
		return "团队管理员"
	case model.EnterpriseMemberRoleDeveloper:
		return "开发者"
	}
	return role
}

// createCreditPeriods 从开通日起按周期切出连续账期，包含今天的那一期为 open，之前的为 closing（等出账）
func (s *seeder) createCreditPeriods(demo *demoEnterprise, spec enterpriseSpec) error {
	anchor := s.start.AddDate(0, 0, spec.AnchorDaysAfterStart)
	if err := model.DB.Model(&model.Enterprise{}).Where("id = ?", demo.Ent.Id).Update("credit_anchor_at", anchor.Unix()).Error; err != nil {
		return err
	}
	periodStart := anchor
	for no := 1; ; no++ {
		var periodEnd time.Time
		if spec.CycleType == model.EnterpriseCreditCycleFixedDays {
			periodEnd = periodStart.AddDate(0, 0, spec.CycleDays)
		} else {
			periodEnd = time.Date(periodStart.Year(), periodStart.Month(), 1, 0, 0, 0, 0, s.loc).AddDate(0, 1, 0)
		}
		open := periodEnd.After(s.now)
		period := &model.EnterpriseCreditPeriod{EnterpriseId: demo.Ent.Id, PeriodNo: no, StartAt: periodStart.Unix(), EndAt: periodEnd.Unix(),
			Status: model.EnterpriseCreditPeriodClosing, ClosedAt: periodEnd.Unix(), CreatedAt: periodStart.Unix(), UpdatedAt: periodEnd.Unix()}
		if open {
			period.Status = model.EnterpriseCreditPeriodOpen
			period.ClosedAt = 0
			period.UpdatedAt = s.now.Unix()
		}
		if err := model.DB.Create(period).Error; err != nil {
			return err
		}
		demo.Periods = append(demo.Periods, period)
		if open {
			return nil
		}
		periodStart = periodEnd
	}
}

// backdate 把 created_at / updated_at 回溯到 at
func backdate(table any, id int, at int64) error {
	return model.DB.Model(table).Where("id = ?", id).Updates(map[string]any{"created_at": at, "updated_at": at}).Error
}

// roundUpUSD 额度按整百美元取整，看起来像人定的
func roundUpUSD(quota float64, step float64) int64 {
	return quotaOfUSD(math.Ceil(usd(int64(quota))/step) * step)
}
