package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/shopspring/decimal"
)

// 管理后台用到的其余数据：推广人与结算、试用线索、企业审计；以及派生统计回填与缓存清理

const promoterShareRate = 12.0

func (s *seeder) seedPromoter() error {
	createdAt := s.start.Unix() - 4*86400
	if err := model.CreatePromoter(&model.Promoter{UserId: s.promoterId, Remark: "华东渠道合作伙伴", ShareRate: promoterShareRate,
		CreatedBy: s.rootId, CreatedAt: createdAt, UpdatedAt: createdAt}); err != nil {
		return err
	}
	var bound []int
	for _, account := range s.personal {
		if account.User.Username == "demo_bob" || account.User.Username == "demo_carol" {
			bound = append(bound, account.User.Id)
		}
	}
	for _, demo := range s.enterprises {
		if demo.Key == "acme" || demo.Key == "globex" {
			bound = append(bound, demo.Owner.Id)
		}
	}
	for _, userId := range bound {
		if err := model.CreatePromoterBinding(&model.PromoterBinding{PromoterUserId: s.promoterId, UserId: userId,
			Source: model.PromoterBindingSourceAdmin, BoundBy: s.rootId, BoundAt: createdAt}); err != nil {
			return err
		}
	}
	// 已结束的月份里，除最近一个月外都已结算（最近一个月留作「待结算」）
	local := s.now.In(s.loc)
	currentMonth := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, s.loc)
	for month := s.start; month.Before(currentMonth.AddDate(0, -1, 0)); month = month.AddDate(0, 1, 0) {
		next := month.AddDate(0, 1, 0)
		var net int64
		for _, userId := range bound {
			net += s.agg.userQuotaBetween(userId, month.Unix(), next.Unix())
		}
		amount := decimal.NewFromFloat(usd(net) * promoterShareRate / 100).Round(2)
		settledAt := next.Unix() + 9*86400
		if err := model.CreatePromoterSettlement(&model.PromoterSettlement{PromoterUserId: s.promoterId, Month: month.Format("2006-01"),
			NetQuotaSnapshot: net, ShareRateSnapshot: promoterShareRate, AmountUSD: decimal.NewNullDecimal(amount),
			Reference: "DEMO-PROMO-" + month.Format("200601"), Remark: "月度分成已线下打款", SettledAt: settledAt, SettledBy: s.rootId,
			CreatedAt: settledAt, UpdatedAt: settledAt}); err != nil {
			return err
		}
	}
	return nil
}

func (s *seeder) seedLeads() error {
	leads := []struct {
		Company, Contact, Volume, Status, Remark string
		DaysAgo                                  float64
	}{
		{"星河云计算", "陈经理 chen", "gt_10k", model.EnterpriseLeadStatusNew, "", 0.3},
		{"北辰教育科技", "刘老师 liu", "1k_10k", model.EnterpriseLeadStatusNew, "", 1.2},
		{"青木医疗", "王总 wang", "1k_10k", model.EnterpriseLeadStatusNew, "", 2.5},
		{"Brightpath Labs", "Emma Stone emma", "lt_1k", model.EnterpriseLeadStatusNew, "", 3.1},
		{"远航物流", "赵主管 zhao", "gt_10k", model.EnterpriseLeadStatusContacted, "已电话沟通，需求是客服机器人，下周演示", 5},
		{"深蓝游戏", "孙制作人 sun", "1k_10k", model.EnterpriseLeadStatusContacted, "关注 Claude 系列价格，已发报价单", 8},
		{"Nordic Analytics", "Lars lars", "gt_10k", model.EnterpriseLeadStatusContacted, "需要欧盟数据驻留，等法务确认", 11},
		{"万象零售", "周总监 zhou", "lt_1k", model.EnterpriseLeadStatusContacted, "预算有限，先试用一个月", 15},
		{"Acme 智能科技", "张伟 zhang.wei", "gt_10k", model.EnterpriseLeadStatusClosed, "已签约（授信企业 demo_acme）", 96},
		{"Globex 数据服务", "Grace grace", "1k_10k", model.EnterpriseLeadStatusClosed, "已签约（预付企业 demo_globex）", 99},
		{"晨光文创", "吴设计 wu", "lt_1k", model.EnterpriseLeadStatusClosed, "需求不匹配，已关闭", 27},
		{"Helix Robotics", "Ivan ivan", "1k_10k", model.EnterpriseLeadStatusClosed, "选择了自建方案", 40},
	}
	for i, lead := range leads {
		createdAt := s.daysAgo(lead.DaysAgo)
		updatedAt := createdAt
		if lead.Status != model.EnterpriseLeadStatusNew {
			updatedAt = createdAt + 86400
		}
		contactName, handle, _ := strings.Cut(lead.Contact, " ")
		if err := model.DB.Create(&model.EnterpriseTrialLead{Company: lead.Company, Contact: contactName + " " + handle + demoLeadEmailSuffix,
			Volume: lead.Volume, Status: lead.Status, Remark: lead.Remark, ClientIP: fmt.Sprintf("10.20.%d.%d", i, 10+i),
			CreatedAt: createdAt, UpdatedAt: updatedAt}).Error; err != nil {
			return err
		}
	}
	return nil
}

// 企业审计的英文兜底文本，与 controller/audit.go 的模板一致（前端按 action 翻译）
var auditTemplates = map[string]string{
	"enterprise.member.create":        "Created member ${name} (ID: ${member_id}) in team ${team_id}",
	"enterprise.member.update":        "Updated member ${name} (ID: ${member_id}): team ${team_id}, status ${status}",
	"enterprise.member.import":        "Imported ${count} members (${team_count} new teams)",
	"enterprise.member.role":          "Changed role of member ${member_id} from ${from} to ${to}",
	"enterprise.token.create":         "Created enterprise API key ${name} (ID: ${token_id}) for team ${team_id}, member ${member_id}",
	"enterprise.token.status":         "Changed status of enterprise API key ${name} (ID: ${token_id}) from ${from} to ${to}",
	"enterprise.token.reveal_key":     "Viewed the full key of enterprise API key ${name} (ID: ${token_id})",
	"enterprise.token.quota_policy":   "Set periodic quota of enterprise API key ${token_id} to ${reset_period} ${period_quota}",
	"enterprise.team.update":          "Updated team ${team_name} (ID: ${team_id})",
	"enterprise.team.archive":         "Archived team ${team_id}",
	"enterprise.usage.export":         "Exported usage (${file})",
	"enterprise.bill.export":          "Exported bill ${bill_no} (${file})",
	"enterprise.finance_usage.export": "Exported reconciliation usage (${file})",
}

func (s *seeder) seedAudit() error {
	for _, demo := range s.enterprises {
		if demo.Key != "acme" && demo.Key != "globex" {
			continue
		}
		var members []model.EnterpriseMember
		if err := model.DB.Where("enterprise_id = ?", demo.Ent.Id).Order("id").Find(&members).Error; err != nil {
			return err
		}
		var tokens []model.Token
		if err := model.DB.Where("user_id = ?", demo.Owner.Id).Order("id").Find(&tokens).Error; err != nil {
			return err
		}
		var bills []model.EnterpriseBill
		if err := model.DB.Where("enterprise_id = ?", demo.Ent.Id).Order("id").Find(&bills).Error; err != nil {
			return err
		}
		actors := []int{demo.Owner.Id}
		for _, role := range []string{model.EnterpriseMemberRoleEnterpriseAdmin, model.EnterpriseMemberRoleTeamAdmin} {
			if id := demo.LoginUsers[role]; id > 0 {
				actors = append(actors, id)
			}
		}
		count := 46
		if demo.Key == "globex" {
			count = 14
		}
		for i := range count {
			member := members[s.rng.IntN(len(members))]
			token := tokens[s.rng.IntN(len(tokens))]
			var action string
			var params map[string]any
			switch pick := s.rng.IntN(12); {
			case pick < 3:
				action, params = "enterprise.token.reveal_key", map[string]any{"name": token.Name, "token_id": token.Id}
			case pick < 5:
				action, params = "enterprise.usage.export", map[string]any{"file": fmt.Sprintf("usage-%s.csv", time.Unix(s.daysAgo(float64(i)), 0).In(s.loc).Format("2006-01"))}
			case pick == 5:
				action, params = "enterprise.member.update", map[string]any{"name": member.Name, "member_id": member.Id, "team_id": member.TeamId, "status": member.Status}
			case pick == 6:
				action, params = "enterprise.token.create", map[string]any{"name": token.Name, "token_id": token.Id, "team_id": member.TeamId, "member_id": member.Id}
			case pick == 7:
				action, params = "enterprise.token.status", map[string]any{"name": token.Name, "token_id": token.Id, "from": "enabled", "to": "disabled"}
			case pick == 8:
				action, params = "enterprise.member.role", map[string]any{"member_id": member.Id, "from": "none", "to": "developer"}
			case pick == 9:
				action, params = "enterprise.token.quota_policy", map[string]any{"token_id": token.Id, "reset_period": "monthly", "period_quota": "$200"}
			case pick == 10 && len(bills) > 0:
				bill := bills[s.rng.IntN(len(bills))]
				action, params = "enterprise.bill.export", map[string]any{"bill_no": bill.BillNo, "file": bill.BillNo + ".xlsx"}
			default:
				action, params = "enterprise.member.import", map[string]any{"count": 3 + s.rng.IntN(8), "team_count": s.rng.IntN(2)}
			}
			params["enterprise_id"] = demo.Ent.Id
			actor := actors[s.rng.IntN(len(actors))]
			username, _ := model.GetUsernameById(actor, false)
			createdAt := s.daysAgo(30*s.rng.Float64()) - int64(s.rng.IntN(3600))
			if err := model.LOG_DB.Create(&model.AuditLog{EventId: common.NewRequestId(), UserId: actor, Username: username,
				ActorRole: common.RoleCommonUser, CreatedAt: createdAt, Category: model.AuditCategorySecurity, Action: action,
				AuthMethod: "session", Ip: fmt.Sprintf("10.8.%d.%d", s.rng.IntN(4), 20+s.rng.IntN(200)),
				UserAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
				Method:    "POST", Route: "/api/enterprise", Status: 200, Success: true, RequestId: common.NewRequestId(),
				Content: renderAudit(action, params), Other: model.AuditOther{Op: &model.AuditOperation{Action: action, Params: params}},
			}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func renderAudit(action string, params map[string]any) string {
	return os.Expand(auditTemplates[action], func(key string) string {
		if v, ok := params[key]; ok {
			return fmt.Sprintf("%v", v)
		}
		return ""
	})
}

// backfillChannelStats 渠道小时 / 累计统计整表按 logs 重建；日维度逐日重建（含今天）
func (s *seeder) backfillChannelStats() error {
	ctx := context.Background()
	if _, err := service.BackfillChannelUsage(ctx); err != nil {
		return err
	}
	for day := s.start; day.Before(s.now); day = day.AddDate(0, 0, 1) {
		if _, _, err := service.BackfillChannelDimUsageDay(ctx, day.Unix()); err != nil {
			return err
		}
	}
	return nil
}

// flushCaches 本地 dev 的 Redis 只放派生缓存（用户 / key 额度等），整库清空让 API 重新从库里读
func (s *seeder) flushCaches() error {
	if !common.RedisEnabled || common.RDB == nil {
		return nil
	}
	return common.RDB.FlushDB(context.Background()).Err()
}

func (s *seeder) printAccounts() {
	fmt.Printf("\n示例账号（密码统一 %s）：\n", demoPassword)
	for _, account := range s.personal {
		fmt.Printf("  %-34s %s\n", "个人用户 "+account.User.DisplayName, account.User.Username)
	}
	fmt.Printf("  %-34s %s\n", "推广人", "demo_promoter")
	for _, login := range s.logins {
		fmt.Printf("  %-34s %s\n", login.Role, login.Username)
	}
}
