package service

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

// 团队月度预算（TokenFunc 二开，M14）：预扣前拦截 + 通知发送。判档与去重在 model/enterprise_team_budget.go。

// ErrorCodeTeamBudgetExceeded 团队预算用尽（勾了拦截）时返回给调用方的错误码
const ErrorCodeTeamBudgetExceeded types.ErrorCode = "team_budget_exceeded"

const teamBudgetNotifyType = "enterprise_team_budget"

// errTeamBudgetExceeded 固定英文句，日志与测试用；客户端收到的是按请求语言翻译后的文案
var errTeamBudgetExceeded = errors.New("team monthly budget exceeded")

// teamBudgetAlertDispatch 发送在后台执行，不阻塞用量聚合；测试替换为同步执行
var teamBudgetAlertDispatch = func(task func()) { gopool.Go(task) }

// teamBudgetAlertNotify 实际发送函数，测试替换
var teamBudgetAlertNotify = sendTeamBudgetAlert

func init() {
	model.TeamBudgetAlertSender = func(alert model.TeamBudgetAlert) {
		teamBudgetAlertDispatch(func() { teamBudgetAlertNotify(alert) })
	}
}

// checkTeamBudgetGate 预扣前的团队预算拦截：只对勾了「超限拦截」的团队生效，本月消耗 + 预估预扣 > 预算 即 403。
// 非企业请求与没有预算团队的企业只多一次 map 读；归属查询走 30 秒缓存，本月消耗走 60 秒缓存，接受窗口内略超。
func checkTeamBudgetGate(c *gin.Context, info *model.EnterpriseBillingInfo, tokenId int, preConsumedQuota int) *types.NewAPIError {
	if len(info.TeamBudgets) == 0 {
		return nil
	}
	teamId, err := model.TokenTeamId(tokenId)
	if err != nil {
		return types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
	}
	budget, ok := info.TeamBudgets[teamId]
	if !ok || !budget.Enforce {
		return nil
	}
	used, err := model.GetTeamMonthUsage(info.EnterpriseId, teamId)
	if err != nil {
		return types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
	}
	if used+int64(max(preConsumedQuota, 0)) <= budget.Quota {
		return nil
	}
	model.RaiseTeamBudgetExceeded(info.EnterpriseId, teamId, budget, used)
	return types.NewErrorWithStatusCode(
		errors.New(i18n.T(c, i18n.MsgQuotaTeamBudgetExceeded)),
		ErrorCodeTeamBudgetExceeded, http.StatusForbidden,
		types.ErrOptionWithSkipRetry(), types.ErrOptionWithNoRecordErrorLog())
}

// sendTeamBudgetAlert 发送团队预算通知：企业账单邮箱 + root 必发 + 企业主（通知渠道不是邮箱或邮箱不同时）+ 该团队管理员（非邮箱渠道）
func sendTeamBudgetAlert(alert model.TeamBudgetAlert) {
	enterprise, err := model.GetEnterpriseById(alert.EnterpriseId)
	if err != nil {
		common.SysError(fmt.Sprintf("enterprise team budget: load enterprise %d failed: %v", alert.EnterpriseId, err))
		return
	}
	teamName := fmt.Sprintf("#%d", alert.TeamId)
	if team, err := model.GetEnterpriseTeam(alert.EnterpriseId, alert.TeamId, model.EnterpriseScope{}); err == nil {
		teamName = team.Name
	}
	usedPercent := int64(0)
	if alert.BudgetQuota > 0 {
		usedPercent = alert.UsedQuota * 100 / alert.BudgetQuota
	}
	link := strings.TrimRight(system_setting.ServerAddress, "/") + fmt.Sprintf("/enterprise/organization?team_id=%d", alert.TeamId)
	subject := fmt.Sprintf("[%s] Team budget alert: %s reached %d%% of its monthly budget", common.SystemName, teamName, alert.AlertPercent)
	headline := fmt.Sprintf("Team %s has used %d%% of its monthly budget.", teamName, alert.AlertPercent)
	if alert.Kind == model.TeamBudgetKindExceeded {
		subject = fmt.Sprintf("[%s] Team budget exceeded: %s", common.SystemName, teamName)
		headline = fmt.Sprintf("Team %s has used up its monthly budget.", teamName)
	}
	enforceLine := "Requests are not blocked; only this notice is sent."
	if alert.Enforce {
		enforceLine = "Requests from this team's API keys are blocked for the rest of the month (budget enforcement is on)."
	}
	content := fmt.Sprintf(`<p>%s</p><p>Enterprise: <b>%s</b><br/>Team: <b>%s</b><br/>Month: %s<br/>Used: <b>%s USD</b> / %s USD (%d%%)</p><p>%s</p><p><a href="%s">%s</a></p>`,
		headline, enterprise.Name, teamName, alert.Month,
		model.QuotaToUSD(alert.UsedQuota).StringFixed(2), model.QuotaToUSD(alert.BudgetQuota).StringFixed(2), usedPercent,
		enforceLine, link, link)

	receiver := enterpriseNoticeReceiver(enterprise)
	if receiver != "" && common.SMTPServer != "" {
		if err := common.SendEmail(subject, receiver, content); err != nil {
			common.SysError(fmt.Sprintf("enterprise team budget: send email to enterprise %d failed: %v", alert.EnterpriseId, err))
		}
	}
	NotifyRootUser(teamBudgetNotifyType, subject, content)

	notify := dto.NewNotify(teamBudgetNotifyType, subject, content, nil)
	if owner, err := model.GetUserById(enterprise.UserId, false); err == nil {
		setting := owner.GetSetting()
		ownerEmail := strings.TrimSpace(setting.NotificationEmail)
		if ownerEmail == "" {
			ownerEmail = strings.TrimSpace(owner.Email)
		}
		usesEmail := setting.NotifyType == "" || setting.NotifyType == dto.NotifyTypeEmail
		// 邮箱渠道且与企业收件箱相同（或没有邮箱）时已经发过，不重复
		if !usesEmail || (ownerEmail != "" && !strings.EqualFold(ownerEmail, receiver)) {
			if err := NotifyUser(owner.Id, owner.Email, setting, notify); err != nil {
				common.SysError(fmt.Sprintf("enterprise team budget: notify owner %d failed: %v", owner.Id, err))
			}
		}
	}
	// 团队管理员若绑定了登录账号且用 webhook / bark / gotify，一并推送（邮箱渠道由企业收件箱覆盖）
	adminUserIds, err := model.ListTeamAdminUserIds(alert.EnterpriseId, alert.TeamId)
	if err != nil {
		common.SysError(fmt.Sprintf("enterprise team budget: list team %d admins failed: %v", alert.TeamId, err))
		return
	}
	for _, userId := range adminUserIds {
		admin, err := model.GetUserById(userId, false)
		if err != nil {
			continue
		}
		setting := admin.GetSetting()
		if setting.NotifyType == "" || setting.NotifyType == dto.NotifyTypeEmail {
			continue
		}
		if err := NotifyUser(admin.Id, admin.Email, setting, notify); err != nil {
			common.SysError(fmt.Sprintf("enterprise team budget: notify team admin %d failed: %v", admin.Id, err))
		}
	}
}
