package service

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// billingIssueRecorders 替换出账任务的三个注入点（出账函数 / 管理员告警 / 对账差异通知），用例结束恢复并清零退避与去重状态
type billingIssueRecorders struct {
	alerts      []string
	diffNotices []string
}

func installBillingIssueRecorders(t *testing.T) *billingIssueRecorders {
	t.Helper()
	recorder := &billingIssueRecorders{}
	previousIssue, previousAlert, previousDiff := issueCreditBill, logArchiveNotify, reconcileDiffNotify
	logArchiveNotify = func(subject, _ string) { recorder.alerts = append(recorder.alerts, subject) }
	reconcileDiffNotify = func(_, content string) { recorder.diffNotices = append(recorder.diffNotices, content) }
	t.Cleanup(func() {
		issueCreditBill, logArchiveNotify, reconcileDiffNotify = previousIssue, previousAlert, previousDiff
		billingIssueBackoffMu.Lock()
		billingIssueBackoff = map[int64]billingIssueAttempt{}
		billingIssueBackoffMu.Unlock()
		logArchiveAlertMu.Lock()
		logArchiveAlertSent = map[string]time.Time{}
		logArchiveAlertMu.Unlock()
	})
	return recorder
}

// closingPeriodWithUsage 让企业当前 open 期带上 counter / detail 两边的消费并转为 closing（在途为 0，可立即出账）
func closingPeriodWithUsage(t *testing.T, enterpriseId int, counterQuota int64, detailQuota int64) *model.EnterpriseCreditPeriod {
	t.Helper()
	period, err := model.EnsureOpenCreditPeriod(enterpriseId)
	require.NoError(t, err)
	if counterQuota > 0 {
		ok, err := model.AddCreditUsage(period.Id, counterQuota, 0, false)
		require.NoError(t, err)
		require.True(t, ok)
	}
	if detailQuota > 0 {
		require.NoError(t, model.DB.Create(&model.EnterpriseUsageDaily{
			Day: time.Now().In(model.BillingLocation()).Format("2006-01-02"), EnterpriseId: enterpriseId, TokenId: 1, ModelName: "gpt-4o",
			PeriodId: period.Id, RequestCount: 1, Quota: detailQuota, UpdatedAt: common.GetTimestamp(),
		}).Error)
	}
	now := common.GetTimestamp()
	require.NoError(t, model.DB.Model(&model.EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{
		"status": model.EnterpriseCreditPeriodClosing, "closed_at": now, "inflight_count": 0,
	}).Error)
	return period
}

func TestEnterpriseBillingIssueBackoffAndReconcileNotify(t *testing.T) {
	setupCreditFundingPostgres(t)
	recorder := installBillingIssueRecorders(t)
	_, ent := newCreditEnterprise(t, "issueflow", model.EnterpriseBillingModeCredit)
	ctx := context.Background()
	base := common.GetTimestamp()

	// 计数器 1,000,000、明细 999,900：出账后应有 100 的对账差异
	period := closingPeriodWithUsage(t, ent.Id, 1_000_000, 999_900)
	calls := 0
	issueCreditBill = func(int64) (*model.EnterpriseBill, error) {
		calls++
		return nil, errors.New("pg is down")
	}

	// 失败退避 1/2/4/8 分钟：退避期内不重试；第 3 次起告警，之后 24h 内不重复
	runEnterpriseBillingOnce(ctx, base)
	assert.Equal(t, 1, calls)
	runEnterpriseBillingOnce(ctx, base+30)
	assert.Equal(t, 1, calls, "no retry within the first minute")
	runEnterpriseBillingOnce(ctx, base+60)
	assert.Equal(t, 2, calls)
	assert.Empty(t, recorder.alerts)
	runEnterpriseBillingOnce(ctx, base+179)
	assert.Equal(t, 2, calls, "no retry within the 2-minute backoff")
	runEnterpriseBillingOnce(ctx, base+180)
	assert.Equal(t, 3, calls)
	assert.Equal(t, []string{"Enterprise bill issuing keeps failing"}, recorder.alerts)
	runEnterpriseBillingOnce(ctx, base+420)
	assert.Equal(t, 4, calls)
	assert.Len(t, recorder.alerts, 1, "alert is deduplicated for 24h")
	assert.Empty(t, recorder.diffNotices)

	// 恢复：真实出账成功 → 退避清零、恢复通知一次、对账差异通知一次（含账单号与财务详情链接）
	issueCreditBill = model.IssueCreditBill
	runEnterpriseBillingOnce(ctx, base+899)
	assert.Equal(t, 4, calls, "8-minute backoff still holds")
	runEnterpriseBillingOnce(ctx, base+900)
	billed, err := model.GetCreditPeriodById(period.Id)
	require.NoError(t, err)
	require.Equal(t, model.EnterpriseCreditPeriodBilled, billed.Status)
	bill, err := model.GetEnterpriseBill(billed.BillId)
	require.NoError(t, err)
	assert.Equal(t, int64(100), bill.ReconcileDiffQuota)
	assert.Equal(t, []string{"Enterprise bill issuing keeps failing", "Enterprise bill issuing recovered"}, recorder.alerts)
	require.Len(t, recorder.diffNotices, 1)
	assert.Contains(t, recorder.diffNotices[0], bill.BillNo)
	assert.Contains(t, recorder.diffNotices[0], fmt.Sprintf("/finance/bills/bill-%d", bill.Id))
	assert.True(t, billingIssueReady(period.Id, time.Unix(0, 0)), "backoff state is cleared after success")

	// 幂等：对已出账的期再次调用只返回已有账单，不重复通知
	again, err := IssueCreditBillAndNotify(period.Id)
	require.NoError(t, err)
	assert.Equal(t, bill.Id, again.Id)
	assert.Len(t, recorder.diffNotices, 1)

	// 计数器与明细一致：出账但不通知；零消费账期：直接结束，不算失败也不通知
	consistent := closingPeriodWithUsage(t, ent.Id, 500, 500)
	runEnterpriseBillingOnce(ctx, base+960)
	consistentBilled, err := model.GetCreditPeriodById(consistent.Id)
	require.NoError(t, err)
	assert.Equal(t, model.EnterpriseCreditPeriodBilled, consistentBilled.Status)
	assert.NotZero(t, consistentBilled.BillId)
	empty := closingPeriodWithUsage(t, ent.Id, 0, 0)
	runEnterpriseBillingOnce(ctx, base+1020)
	emptyBilled, err := model.GetCreditPeriodById(empty.Id)
	require.NoError(t, err)
	assert.Equal(t, model.EnterpriseCreditPeriodBilled, emptyBilled.Status)
	assert.Zero(t, emptyBilled.BillId)
	assert.Len(t, recorder.diffNotices, 1)
	assert.Len(t, recorder.alerts, 2)
	billingIssueBackoffMu.Lock()
	assert.Empty(t, billingIssueBackoff, "successful and empty periods leave no backoff state")
	billingIssueBackoffMu.Unlock()
}
