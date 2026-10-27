package main

import (
	"fmt"
	"math/rand/v2"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// seeder 一次灌数的上下文：时间轴、随机源、建好的实体与流量画像
type seeder struct {
	seed  uint64
	rng   *rand.Rand
	now   time.Time
	loc   *time.Location
	start time.Time // 跨度起点：3 个自然月前的 1 号 00:00（上海）

	rootId     int
	channelIds map[string]int
	plans      []*accountPlan
	agg        *aggregator

	personal    []*personalAccount
	enterprises []*demoEnterprise
	promoterId  int
	logins      []loginInfo
}

type loginInfo struct {
	Role     string
	Username string
}

func newSeeder(seed uint64, now time.Time) *seeder {
	loc := model.BillingLocation()
	local := now.In(loc)
	start := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, -3, 0)
	return &seeder{
		seed: seed, rng: rand.New(rand.NewPCG(seed, seed+1)), now: now, loc: loc, start: start,
		channelIds: map[string]int{},
	}
}

func (s *seeder) run() error {
	if err := cleanupDemoData(); err != nil {
		return fmt.Errorf("cleanup: %w", err)
	}
	if err := model.DB.Model(&model.User{}).Where("role = ?", common.RoleRootUser).Order("id").Limit(1).Pluck("id", &s.rootId).Error; err != nil {
		return err
	}
	if err := s.ensureOptions(); err != nil {
		return err
	}
	steps := []struct {
		name string
		run  func() error
	}{
		{"渠道", s.createChannels},
		{"个人用户", s.createPersonalAccounts},
		{"企业", s.createEnterprises},
		{"用量流水", s.generateUsage},
		{"日汇总", s.rollupDays},
		{"个人充值", s.seedPersonalTopups},
		{"企业账期与账单", s.seedEnterpriseBilling},
		{"团队预算与 key 限额", s.seedBudgetsAndPolicies},
		{"推广人", s.seedPromoter},
		{"试用线索", s.seedLeads},
		{"审计日志", s.seedAudit},
		{"渠道统计回填", s.backfillChannelStats},
		{"缓存", s.flushCaches},
	}
	for _, step := range steps {
		began := time.Now()
		if err := step.run(); err != nil {
			return fmt.Errorf("%s: %w", step.name, err)
		}
		fmt.Printf("✓ %s（%s）\n", step.name, time.Since(began).Round(time.Millisecond))
	}
	return nil
}

// ensureOptions 个人概览依赖数据看板导出；报价 / 账单需要我方开票信息（只在为空时补）
func (s *seeder) ensureOptions() error {
	if err := model.UpdateOption("DataExportEnabled", "true"); err != nil {
		return err
	}
	if model.GetEnterpriseSellerProfile().CompanyName != "" {
		return nil
	}
	return model.SaveEnterpriseSellerProfile(model.EnterpriseSellerProfile{
		CompanyName: "TokenFunc Demo Ltd.", Address: "1 Demo Street, Singapore 018989", TaxId: "SG-DEMO-0001",
		Email: "billing" + demoLeadEmailSuffix, Phone: "+65 6000 0000", BankName: "Demo Bank Singapore",
		BankAccountName: "TokenFunc Demo Ltd.", BankAccountNo: "000-123456-001", SwiftCode: "DEMOSGSG",
		PaymentNotes: "请在备注中填写账单号", FooterNotes: "示例数据，仅供本地演示",
	})
}

func (s *seeder) createChannels() error {
	for _, spec := range demoChannels {
		baseURL := demoChannelBaseURL
		weight := uint(10)
		priority := int64(0)
		channel := &model.Channel{
			Type: 1, Key: "sk-demo-mock-" + spec.Key, Status: common.ChannelStatusEnabled, Name: spec.Name,
			Weight: &weight, Priority: &priority, BaseURL: &baseURL, Models: strings.Join(spec.Models, ","), Group: "default",
			CreatedTime: s.start.Unix() - 3*86400,
		}
		if err := channel.Insert(); err != nil {
			return err
		}
		s.channelIds[spec.Key] = channel.Id
	}
	return nil
}

// newDemoKey 生成一把 sk 风格的 key（只用于本地示例）
func newDemoKey() string {
	key, err := common.GenerateKey()
	if err != nil {
		panic(err)
	}
	return key
}

// createUser 建一个普通用户并把注册时间回溯到跨度之前
func (s *seeder) createUser(username string, displayName string, email string, createdAt int64) (*model.User, error) {
	user := &model.User{Username: username, Password: demoPassword, DisplayName: displayName, Email: email,
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default"}
	if err := user.Insert(0); err != nil {
		return nil, err
	}
	err := model.DB.Model(&model.User{}).Where("id = ?", user.Id).Updates(map[string]any{"created_at": createdAt, "quota": 0}).Error
	return user, err
}

func (s *seeder) daysAgo(days float64) int64 {
	return s.now.Add(-time.Duration(days * float64(24*time.Hour))).Unix()
}

func usd(quota int64) float64 {
	return float64(quota) / common.QuotaPerUnit
}

func quotaOfUSD(amount float64) int64 {
	return int64(amount * common.QuotaPerUnit)
}

func itoa(v int) string { return strconv.Itoa(v) }
