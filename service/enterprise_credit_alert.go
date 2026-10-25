package service

import (
	"fmt"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/bytedance/gopkg/util/gopool"
)

// 授信额度预警（TokenFunc 二开）
//
// 授信企业的 SettleBilling 不走上游 quotaReminderDue，此前额度用尽前没有任何通知、直接 403。
// 这里在预扣成功 / 结算后用 RETURNING 回来的 used/limit 判档，热路径不回查账期：
//   - warn：used*100 >= limit*alert_percent（alert_percent=0 关闭全部预警）
//   - exhausted：used >= limit，或预扣被拒（即将 403）
// 同一期同一档只发一次：先看进程内标记，再由 ent_credit_notify_records 的 ON CONFLICT 抢占（多副本安全）；
// 进程内标记的键带 limit，额度上调后键变化、DB 记录已被 ConfigureEnterpriseCredit 清掉，预警可再次触发。
// 换期后 period_id 不同，自然重置。

const creditAlertNotifyType = "enterprise_credit_alert"

// creditAlertSent 进程内已发标记："periodId|kind|limit" -> struct{}
var creditAlertSent sync.Map

// creditAlertNotify 实际发送函数，测试替换
var creditAlertNotify = sendCreditAlert

// creditAlertDispatch 抢占与发送在后台执行，不阻塞计费热路径；测试替换为同步执行
var creditAlertDispatch = func(task func()) { gopool.Go(task) }

// checkCreditAlert 按本次更新后的计数判档并异步发送；rejected 表示预扣被拒（直接按用尽处理）
func (f *CreditFunding) checkCreditAlert(state model.CreditUsageState, rejected bool) {
	if state.PeriodId == 0 || state.LimitQuota <= 0 || f.alertPercent <= 0 {
		return
	}
	kind := ""
	switch {
	case rejected || state.UsedQuota >= state.LimitQuota:
		kind = model.CreditNotifyKindExhausted
	case state.UsedQuota*100 >= state.LimitQuota*int64(f.alertPercent):
		kind = model.CreditNotifyKindWarn
	default:
		return
	}
	key := fmt.Sprintf("%d|%s|%d", state.PeriodId, kind, state.LimitQuota)
	if _, sent := creditAlertSent.Load(key); sent {
		return
	}
	enterpriseId, percent := f.enterpriseId, f.alertPercent
	creditAlertDispatch(func() {
		claimed, err := model.ClaimCreditNotify(state.PeriodId, kind, enterpriseId)
		if err != nil {
			common.SysError(fmt.Sprintf("enterprise credit alert: claim period %d %s failed: %v", state.PeriodId, kind, err))
			return
		}
		// 无论本节点还是其他副本已发，之后都不必再打 DB
		creditAlertSent.Store(key, struct{}{})
		if claimed {
			creditAlertNotify(enterpriseId, state, kind, percent)
		}
	})
}

// sendCreditAlert 发送预警：企业账单邮箱 + root 必发 + 主账号（仅当其通知渠道不是邮箱，或通知邮箱与账单邮箱不同）
func sendCreditAlert(enterpriseId int, state model.CreditUsageState, kind string, percent int) {
	enterprise, err := model.GetEnterpriseById(enterpriseId)
	if err != nil {
		common.SysError(fmt.Sprintf("enterprise credit alert: load enterprise %d failed: %v", enterpriseId, err))
		return
	}
	periodNo := 0
	if period, err := model.GetCreditPeriodById(state.PeriodId); err == nil {
		periodNo = period.PeriodNo
	}
	usedPercent := int64(0)
	if state.LimitQuota > 0 {
		usedPercent = state.UsedQuota * 100 / state.LimitQuota
	}
	link := strings.TrimRight(system_setting.ServerAddress, "/") + "/enterprise/overview"
	subject := fmt.Sprintf("[%s] Credit usage alert: %s reached %d%% of the period limit", common.SystemName, enterprise.Name, percent)
	headline := fmt.Sprintf("Credit usage has reached %d%% of the period limit.", percent)
	if kind == model.CreditNotifyKindExhausted {
		subject = fmt.Sprintf("[%s] Credit limit exhausted: %s", common.SystemName, enterprise.Name)
		switch {
		case enterprise.CreditCycleType == model.EnterpriseCreditCycleQuotaBased && enterprise.CreditAutoReset:
			headline = "The credit limit of the current period is exhausted. The period has been billed and the next period was opened automatically."
		case enterprise.CreditCycleType == model.EnterpriseCreditCycleQuotaBased:
			headline = "The credit limit of the current period is exhausted. The period has been billed; new requests are rejected until the bill is paid or the next period is opened manually."
		default:
			headline = "The credit limit of the current period is exhausted. New requests are rejected until the limit is raised or the next period starts."
		}
	}
	content := fmt.Sprintf(`<p>%s</p><p>Enterprise: <b>%s</b><br/>Period: #%d<br/>Used: <b>%s USD</b> / %s USD (%d%%)</p><p><a href="%s">%s</a></p>`,
		headline, enterprise.Name, periodNo, model.QuotaToUSD(state.UsedQuota).StringFixed(2), model.QuotaToUSD(state.LimitQuota).StringFixed(2), usedPercent, link, link)

	receiver := enterpriseNoticeReceiver(enterprise)
	if receiver != "" && common.SMTPServer != "" {
		if err := common.SendEmail(subject, receiver, content); err != nil {
			common.SysError(fmt.Sprintf("enterprise credit alert: send email to enterprise %d failed: %v", enterpriseId, err))
		}
	}
	NotifyRootUser(creditAlertNotifyType, subject, content)

	owner, err := model.GetUserById(enterprise.UserId, false)
	if err != nil {
		return
	}
	setting := owner.GetSetting()
	ownerEmail := strings.TrimSpace(setting.NotificationEmail)
	if ownerEmail == "" {
		ownerEmail = strings.TrimSpace(owner.Email)
	}
	usesEmail := setting.NotifyType == "" || setting.NotifyType == dto.NotifyTypeEmail
	if usesEmail && (ownerEmail == "" || strings.EqualFold(ownerEmail, receiver)) {
		return
	}
	if err := NotifyUser(owner.Id, owner.Email, setting, dto.NewNotify(creditAlertNotifyType, subject, content, nil)); err != nil {
		common.SysError(fmt.Sprintf("enterprise credit alert: notify owner %d failed: %v", owner.Id, err))
	}
}
