package main

import (
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// 个人用户：一个重度用户（个人概览的主角）+ 几个轻量用户（让财务中心的用户排行有层次）+ 推广人

type personalAccount struct {
	User *model.User
	Plan *accountPlan
	// RunwayDays 余额按最近 7 天日均消耗能撑的天数
	RunwayDays float64
}

type personalTokenSpec struct {
	Name   string
	Weight float64
	Mix    modelMix
	// FromDaysAgo / UntilDaysAgo 有流量的时间窗（相对今天的天数，0 表示不限）
	FromDaysAgo  float64
	UntilDaysAgo float64
	Status       int
}

func (s *seeder) createPersonalAccounts() error {
	profiles := []struct {
		Username, Display, Email string
		Daily, PromptScale       float64
		Weekend, StartGrowth     float64
		Runway                   float64
		Tokens                   []personalTokenSpec
	}{
		{"demo_alice", "Alice Chen", "alice" + demoLeadEmailSuffix, 240, 5, 0.75, 0.55, 18, []personalTokenSpec{
			{Name: "Claude Code", Weight: 46, Mix: mixCoding},
			{Name: "Cursor", Weight: 28, Mix: mixMixed},
			{Name: "生产服务", Weight: 20, Mix: mixApp, FromDaysAgo: 75},
			{Name: "测试脚本", Weight: 6, Mix: mixLight, UntilDaysAgo: 9, Status: common.TokenStatusDisabled},
		}},
		{"demo_bob", "Bob Wang", "bob" + demoLeadEmailSuffix, 80, 3, 0.6, 0.8, 30, []personalTokenSpec{
			{Name: "个人助手", Weight: 70, Mix: mixMixed},
			{Name: "自动化", Weight: 30, Mix: mixApp},
		}},
		{"demo_carol", "Carol Liu", "carol" + demoLeadEmailSuffix, 35, 1.6, 0.9, 1.2, 9, []personalTokenSpec{
			{Name: "default", Weight: 1, Mix: mixLight},
		}},
		{"demo_dave", "Dave Zhou", "dave" + demoLeadEmailSuffix, 18, 3.0, 0.4, 0.3, 45, []personalTokenSpec{
			{Name: "研究", Weight: 1, Mix: mixCoding, FromDaysAgo: 50},
		}},
	}
	registered := s.start.Unix() - 5*86400
	for _, profile := range profiles {
		user, err := s.createUser(profile.Username, profile.Display, profile.Email, registered)
		if err != nil {
			return err
		}
		plan := &accountPlan{UserId: user.Id, Username: user.Username, Group: user.Group, DailyRequests: profile.Daily,
			PromptScale: profile.PromptScale, WeekendFactor: profile.Weekend, StartGrowth: profile.StartGrowth, BillingSource: "wallet"}
		for _, spec := range profile.Tokens {
			status := spec.Status
			if status == 0 {
				status = common.TokenStatusEnabled
			}
			createdAt := registered + 86400
			stream := &tokenStream{TokenName: spec.Name, Weight: spec.Weight, Mix: spec.Mix}
			if spec.FromDaysAgo > 0 {
				stream.ActiveFrom = s.daysAgo(spec.FromDaysAgo)
				createdAt = stream.ActiveFrom - 600
			}
			if spec.UntilDaysAgo > 0 {
				stream.ActiveUntil = s.daysAgo(spec.UntilDaysAgo)
			}
			token := &model.Token{UserId: user.Id, Key: newDemoKey(), Status: status, Name: spec.Name, CreatedTime: createdAt,
				ExpiredTime: -1, UnlimitedQuota: true, Group: "", AllowUserQuotaQuery: true}
			if err := model.DB.Create(token).Error; err != nil {
				return err
			}
			stream.TokenId = token.Id
			plan.Streams = append(plan.Streams, stream)
		}
		s.plans = append(s.plans, plan)
		s.personal = append(s.personal, &personalAccount{User: user, Plan: plan, RunwayDays: profile.Runway})
	}

	promoter, err := s.createUser("demo_promoter", "渠道合伙人 Leo", "leo"+demoLeadEmailSuffix, registered)
	if err != nil {
		return err
	}
	s.promoterId = promoter.Id
	return nil
}

// seedPersonalTopups 充值单 = 已消耗 + 期望余额（按最近 7 天日均消耗 × RunwayDays），再拆成若干笔整数金额；
// 另外各补一笔待支付 / 已过期订单，订单中心的状态筛选才有内容
func (s *seeder) seedPersonalTopups() error {
	methods := []struct{ Method, Provider string }{
		{model.PaymentMethodAlipay, model.PaymentProviderEpay}, {model.PaymentMethodStripe, model.PaymentProviderStripe},
		{model.PaymentMethodWxpay, model.PaymentProviderEpay},
	}
	for idx, account := range s.personal {
		totals := s.agg.users[account.User.Id]
		if totals == nil {
			continue
		}
		recent := s.recentDailyQuota(account.User.Id, 7)
		balance := int64(recent * account.RunwayDays)
		need := totals.Quota + balance
		// 金额阶梯：先小后大，模拟用户逐步加大充值
		steps := []float64{10, 20, 50, 50, 100, 100, 200, 200, 500, 500, 1000}
		var orders []float64
		var sum int64
		for i := 0; sum < need; i++ {
			amount := steps[min(i, len(steps)-1)]
			// 最后一笔只补差额（取整到 $10），余额才贴近目标天数
			if remaining := usd(need - sum); remaining < amount {
				amount = math.Ceil(remaining/10) * 10
			}
			orders = append(orders, amount)
			sum += quotaOfUSD(amount)
		}
		balance = sum - totals.Quota
		spanStart, spanEnd := s.start.Unix()-2*86400, s.now.Unix()-86400
		for i, amount := range orders {
			at := spanStart + (spanEnd-spanStart)*int64(i)/int64(len(orders))
			at += int64(s.rng.IntN(36000))
			pay := methods[(idx+i)%len(methods)]
			if err := model.DB.Create(&model.TopUp{
				UserId: account.User.Id, Amount: int64(amount), Money: paidMoney(pay.Provider, amount),
				TradeNo:       fmt.Sprintf("DEMO-%d-%d-%d", account.User.Id, i, at),
				PaymentMethod: pay.Method, PaymentProvider: pay.Provider, CreateTime: at, CompleteTime: at + 40,
				Status: common.TopUpStatusSuccess,
			}).Error; err != nil {
				return err
			}
		}
		for i, status := range []string{common.TopUpStatusPending, common.TopUpStatusExpired} {
			at := s.daysAgo(float64(2 + 11*i))
			if err := model.DB.Create(&model.TopUp{
				UserId: account.User.Id, Amount: 50, Money: paidMoney(model.PaymentProviderEpay, 50),
				TradeNo:       fmt.Sprintf("DEMO-%d-%s-%d", account.User.Id, status, at),
				PaymentMethod: model.PaymentMethodAlipay, PaymentProvider: model.PaymentProviderEpay, CreateTime: at, Status: status,
			}).Error; err != nil {
				return err
			}
		}
		if err := model.DB.Model(&model.User{}).Where("id = ?", account.User.Id).Update("quota", balance).Error; err != nil {
			return err
		}
	}
	return nil
}

// recentDailyQuota 最近 days 个完整自然日的日均消耗（与个人概览的「还能用 N 天」口径一致）
func (s *seeder) recentDailyQuota(userId int, days int) float64 {
	todayStart := startOfDay(s.now.In(s.loc))
	sum := s.agg.userQuotaBetween(userId, todayStart.AddDate(0, 0, -days).Unix(), todayStart.Unix())
	return math.Max(1, float64(sum)/float64(days))
}

// paidMoney 在线充值单的实付金额：易支付 Amount 是美元数、Money 是人民币实付；Stripe 的 Money 是美元（见 model/finance_order.go）
func paidMoney(provider string, amountUSD float64) float64 {
	if provider != model.PaymentProviderEpay {
		return amountUSD
	}
	rate := operation_setting.USDExchangeRate
	if rate <= 0 {
		rate = 7.2
	}
	return math.Round(amountUSD*rate*100) / 100
}
