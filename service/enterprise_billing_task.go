package service

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

var (
	enterpriseDailyTaskMu      sync.Mutex
	enterpriseDailyTaskLastDay string

	// billingIssueBackoff 出账失败账期的进程内退避；重启清零即立即重试（出账幂等）
	billingIssueBackoffMu sync.Mutex
	billingIssueBackoff   = map[int64]billingIssueAttempt{}
)

// 出账失败退避：连续失败按 1/2/4/8/16/30 分钟退避，从第 3 次起通知管理员（同一账期 24h 去重），恢复后通知一次
var billingIssueRetryDelays = []time.Duration{time.Minute, 2 * time.Minute, 4 * time.Minute, 8 * time.Minute, 16 * time.Minute, 30 * time.Minute}

const billingIssueAlertAfterFailures = 3

type billingIssueAttempt struct {
	failures int
	nextAt   time.Time
}

func billingIssueAlertKey(periodId int64) string {
	return fmt.Sprintf("enterprise_billing_issue:%d", periodId)
}

func billingIssueReady(periodId int64, now time.Time) bool {
	billingIssueBackoffMu.Lock()
	defer billingIssueBackoffMu.Unlock()
	attempt, ok := billingIssueBackoff[periodId]
	return !ok || !now.Before(attempt.nextAt)
}

func billingIssueFail(periodId int64, now time.Time) (int, time.Duration) {
	billingIssueBackoffMu.Lock()
	defer billingIssueBackoffMu.Unlock()
	attempt := billingIssueBackoff[periodId]
	attempt.failures++
	delay := billingIssueRetryDelays[min(attempt.failures, len(billingIssueRetryDelays))-1]
	attempt.nextAt = now.Add(delay)
	billingIssueBackoff[periodId] = attempt
	return attempt.failures, delay
}

// billingIssueSucceed 清零退避并返回之前的连续失败次数；同时清掉告警去重键，下一轮失败可以再次告警
func billingIssueSucceed(periodId int64) int {
	billingIssueBackoffMu.Lock()
	attempt := billingIssueBackoff[periodId]
	delete(billingIssueBackoff, periodId)
	billingIssueBackoffMu.Unlock()
	logArchiveAlertMu.Lock()
	delete(logArchiveAlertSent, billingIssueAlertKey(periodId))
	logArchiveAlertMu.Unlock()
	return attempt.failures
}

// runEnterpriseBillingOnce 出账 + 每日任务（催款、预付对账单）。由授信分钟任务在持有锁时调用。
func runEnterpriseBillingOnce(ctx context.Context, now int64) {
	periods, err := model.FindClosingPeriodsReadyToBill(now)
	if err != nil {
		logger.LogWarn(ctx, "enterprise billing: list closing periods failed: "+err.Error())
		return
	}
	clock := time.Unix(now, 0)
	for _, period := range periods {
		if !billingIssueReady(period.Id, clock) {
			continue
		}
		bill, err := IssueCreditBillAndNotify(period.Id)
		if err != nil {
			failures, delay := billingIssueFail(period.Id, clock)
			logger.LogWarn(ctx, fmt.Sprintf("enterprise billing: issue bill for period %d failed (%d in a row, retry in %s): %v", period.Id, failures, delay, err))
			if failures >= billingIssueAlertAfterFailures {
				logArchiveAlert(billingIssueAlertKey(period.Id), "Enterprise bill issuing keeps failing",
					fmt.Sprintf("Credit period %d (enterprise %d) failed to issue its bill %d times in a row; next retry in %s.\nerror: %v", period.Id, period.EnterpriseId, failures, delay, err))
			}
			continue
		}
		if failures := billingIssueSucceed(period.Id); failures >= billingIssueAlertAfterFailures {
			logArchiveNotify("Enterprise bill issuing recovered",
				fmt.Sprintf("Credit period %d (enterprise %d) issued its bill after %d failed attempts.", period.Id, period.EnterpriseId, failures))
		}
		if bill == nil {
			logger.LogInfo(ctx, fmt.Sprintf("enterprise billing: period %d closed without usage", period.Id))
			continue
		}
		logger.LogInfo(ctx, fmt.Sprintf("enterprise billing: issued %s amount=%s for enterprise %d", bill.BillNo, bill.TotalUSD.String(), bill.EnterpriseId))
		sendEnterpriseBillEmail(ctx, bill, false)
		ArchiveBillAsync(bill)
	}

	today := common.GetTimestamp() / 86400
	enterpriseDailyTaskMu.Lock()
	dayKey := fmt.Sprintf("%d", today)
	alreadyRan := enterpriseDailyTaskLastDay == dayKey
	enterpriseDailyTaskLastDay = dayKey
	enterpriseDailyTaskMu.Unlock()
	if alreadyRan {
		return
	}
	// 每日：逾期催款
	bills, err := model.FindBillsDueForReminder(now)
	if err != nil {
		logger.LogWarn(ctx, "enterprise billing: list reminders failed: "+err.Error())
	}
	for _, bill := range bills {
		if sendEnterpriseBillEmail(ctx, bill, true) {
			if err := model.MarkBillReminded(bill.Id, now); err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("enterprise billing: mark reminded %s failed: %v", bill.BillNo, err))
			}
		}
	}
	// 每日：预付企业的上月对账单（幂等，仅在当月第一次运行时新建）
	if created, err := model.GenerateMonthlyStatements(now); err != nil {
		logger.LogWarn(ctx, "enterprise billing: generate statements failed: "+err.Error())
	} else if created > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("enterprise billing: generated %d monthly statements", created))
		// 对账单在 model 层批量生成，直接扫一轮待归档账单即时归档
		runBillArchiveOnce(ctx, time.Now())
	}
}

// enterpriseNoticeReceiver 企业通知收件邮箱：账单邮箱优先，其次联系人邮箱；都没有返回空串
func enterpriseNoticeReceiver(enterprise *model.Enterprise) string {
	if receiver := strings.TrimSpace(enterprise.BillingProfile.BillingEmail); receiver != "" {
		return receiver
	}
	return strings.TrimSpace(enterprise.ContactEmail)
}

// sendEnterpriseBillEmail 给企业的账单邮箱/联系人邮箱发账单或催款邮件；没有配置 SMTP 或邮箱时跳过
func sendEnterpriseBillEmail(ctx context.Context, bill *model.EnterpriseBill, reminder bool) bool {
	if common.SMTPServer == "" {
		return false
	}
	enterprise, err := model.GetEnterpriseById(bill.EnterpriseId)
	if err != nil {
		return false
	}
	receiver := enterpriseNoticeReceiver(enterprise)
	if receiver == "" {
		return false
	}
	link := strings.TrimRight(system_setting.ServerAddress, "/") + fmt.Sprintf("/enterprise/bills/%d", bill.Id)
	subject := fmt.Sprintf("[%s] Bill %s is ready", common.SystemName, bill.BillNo)
	headline := "Your bill is ready"
	if reminder {
		subject = fmt.Sprintf("[%s] Payment reminder for bill %s", common.SystemName, bill.BillNo)
		headline = "Payment reminder"
	}
	content := fmt.Sprintf(`<p>%s</p><p>Bill <b>%s</b> for %s<br/>Amount: <b>%s %s</b><br/>Outstanding: %s %s<br/>Due: %s</p><p><a href="%s">%s</a></p>`,
		headline, bill.BillNo, enterprise.Name, bill.TotalUSD.StringFixed(2), bill.Currency,
		bill.Outstanding().StringFixed(2), bill.Currency, time.Unix(bill.DueAt, 0).In(time.FixedZone("CST", 8*3600)).Format("2006-01-02"), link, link)
	if err := common.SendEmail(subject, receiver, content); err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("enterprise billing: send email for %s failed: %v", bill.BillNo, err))
		return false
	}
	return true
}
