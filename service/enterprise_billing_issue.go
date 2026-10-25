package service

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

const reconcileDiffNotifyType = "enterprise_reconcile_diff"

var (
	// issueCreditBill 实际出账函数，测试替换
	issueCreditBill = model.IssueCreditBill
	// reconcileDiffNotify 对账差异通知的实际发送函数，测试替换
	reconcileDiffNotify = func(subject, content string) { NotifyRootUser(reconcileDiffNotifyType, subject, content) }
)

// IssueCreditBillAndNotify 出账，并在账单的计数器金额与明细合计不一致时通知 root（含财务账单详情链接）。
// 出账任务与管理员手动出账都走这里；对已出账的期重复调用只返回已有账单，不重复通知。
func IssueCreditBillAndNotify(periodId int64) (*model.EnterpriseBill, error) {
	period, err := model.GetCreditPeriodById(periodId)
	if err != nil {
		return nil, err
	}
	alreadyBilled := period.Status == model.EnterpriseCreditPeriodBilled
	bill, err := issueCreditBill(periodId)
	if err != nil || bill == nil || alreadyBilled || bill.ReconcileDiffQuota == 0 {
		return bill, err
	}
	enterpriseName := fmt.Sprintf("#%d", bill.EnterpriseId)
	if enterprise, err := model.GetEnterpriseById(bill.EnterpriseId); err == nil {
		enterpriseName = enterprise.Name
	}
	detailTotal := model.BillDetailTotalQuota(bill)
	link := strings.TrimRight(system_setting.ServerAddress, "/") + fmt.Sprintf("/finance/bills/bill-%d", bill.Id)
	subject := fmt.Sprintf("[%s] Reconciliation difference on bill %s", common.SystemName, bill.BillNo)
	content := fmt.Sprintf(`<p>The period counter and the usage details of bill <b>%s</b> (%s) do not match. The bill was issued from the counter.</p><p>Counter: %s USD<br/>Details: %s USD<br/>Difference: <b>%s USD</b> (%d quota)</p><p><a href="%s">%s</a></p>`,
		bill.BillNo, enterpriseName, model.QuotaToUSD(bill.AmountQuota).StringFixed(6), model.QuotaToUSD(detailTotal).StringFixed(6),
		model.QuotaToUSD(bill.ReconcileDiffQuota).StringFixed(6), bill.ReconcileDiffQuota, link, link)
	reconcileDiffNotify(subject, content)
	return bill, nil
}
