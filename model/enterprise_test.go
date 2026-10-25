package model

import (
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// 企业模块只支持 PostgreSQL（TokenFunc 二开约定），测试必须跑在真实 PG 上
func setupEnterprisePostgres(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)

	previousDB := DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	initCol()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(enterpriseTestTables...))
		require.NoError(t, sqlDB.Close())
		DB = previousDB
		common.SetDatabaseTypes(previousMain, previousLog)
		initCol()
	})
	require.NoError(t, db.Migrator().DropTable(enterpriseTestTables...))
	require.NoError(t, db.AutoMigrate(enterpriseTestTables...))
}

var enterpriseTestTables = []any{
	&User{}, &Token{}, &Enterprise{}, &EnterpriseTeam{}, &EnterpriseMember{}, &EnterpriseTokenAssignment{},
	&EnterpriseCreditPeriod{}, &EnterpriseCreditNotifyRecord{}, &EnterpriseLedgerEntry{}, &EnterpriseUsageDaily{}, &EnterpriseTeamBudgetNotify{}, &EnterpriseBill{}, &EnterpriseTrialLead{},
}

func createEnterpriseTestUser(t *testing.T, username string, role int) *User {
	t.Helper()
	user := &User{Username: username, Password: "password123", DisplayName: username, Role: role, Status: common.UserStatusEnabled, Quota: 1000, AffCode: username}
	require.NoError(t, DB.Create(user).Error)
	return user
}

func TestEnterpriseCreateAndUpgrade(t *testing.T) {
	setupEnterprisePostgres(t)
	previousQuotaForNewUser := common.QuotaForNewUser
	common.QuotaForNewUser = 5000
	t.Cleanup(func() { common.QuotaForNewUser = previousQuotaForNewUser })

	// 新建主账号：不发新用户赠送额度，开票抬头经 jsonb 往返不丢字段
	owner := &User{Username: "acme", Password: "password123", DisplayName: "acme"}
	created := &Enterprise{
		Name:           "  Acme Inc  ",
		BillingProfile: EnterpriseBillingProfile{CompanyName: "Acme Inc", TaxId: "TAX-1"},
	}
	require.NoError(t, CreateEnterpriseWithNewUser(owner, created))
	stored, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	assert.Equal(t, "Acme Inc", stored.Name)
	assert.Equal(t, EnterpriseBillingModePrepaid, stored.BillingMode)
	assert.Equal(t, EnterpriseStatusActive, stored.Status)
	assert.Equal(t, EnterpriseDefaultPaymentTermsDays, stored.PaymentTermsDays)
	assert.Equal(t, EnterpriseDefaultCurrency, stored.Currency)
	assert.Equal(t, EnterpriseBillingProfile{CompanyName: "Acme Inc", TaxId: "TAX-1"}, stored.BillingProfile)
	quota, err := GetUserQuota(owner.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 0, quota)

	// 升级已有普通用户：保留余额；重复升级、管理员账号都被拒绝
	common1 := createEnterpriseTestUser(t, "bob", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(common1.Id, &Enterprise{Name: "Bob Co"}))
	quota, err = GetUserQuota(common1.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 1000, quota)
	assert.ErrorIs(t, UpgradeUserToEnterprise(common1.Id, &Enterprise{Name: "Bob Co 2"}), ErrEnterpriseAlreadyExists)

	admin := createEnterpriseTestUser(t, "admin1", common.RoleAdminUser)
	assert.ErrorIs(t, UpgradeUserToEnterprise(admin.Id, &Enterprise{Name: "Admin Co"}), ErrEnterpriseUserNotEligible)

	assert.Error(t, UpgradeUserToEnterprise(createEnterpriseTestUser(t, "carol", common.RoleCommonUser).Id, &Enterprise{Name: " "}))
}

func TestEnterpriseUserTypeFilterAndList(t *testing.T) {
	setupEnterprisePostgres(t)
	personal := createEnterpriseTestUser(t, "personal1", common.RoleCommonUser)
	entUser := createEnterpriseTestUser(t, "entuser1", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(entUser.Id, &Enterprise{Name: "Globex", ContactName: "Hank"}))

	page := &common.PageInfo{Page: 1, PageSize: 20}
	userIds := func(users []*User) []int {
		ids := make([]int, 0, len(users))
		for _, u := range users {
			ids = append(ids, u.Id)
		}
		return ids
	}

	users, total, err := GetAllUsers(page, UserTypePersonal)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, []int{personal.Id}, userIds(users))

	users, total, err = GetAllUsers(page, UserTypeEnterprise)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, []int{entUser.Id}, userIds(users))

	_, total, err = GetAllUsers(page, "")
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)

	users, total, err = SearchUsers("user", "", nil, nil, UserTypeEnterprise, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, []int{entUser.Id}, userIds(users))

	// 企业列表：关键字不区分大小写，可匹配联系人与主账号用户名
	for _, keyword := range []string{"globex", "hank", "ENTUSER"} {
		items, total, err := ListEnterprises(keyword, "", 0, 20)
		require.NoError(t, err)
		require.Equal(t, int64(1), total, keyword)
		assert.Equal(t, "Globex", items[0].Name)
		assert.Equal(t, "entuser1", items[0].Username)
		assert.Equal(t, 1000, items[0].Quota)
	}
	_, total, err = ListEnterprises("", EnterpriseBillingModeCredit, 0, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(0), total)

	// 授信企业的列表行带当前账期额度/已用；预付企业两项为 0
	ent, err := GetEnterpriseByUserId(entUser.Id)
	require.NoError(t, err)
	require.NoError(t, ConfigureEnterpriseCredit(ent.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleNaturalMonth, LimitQuota: 5000}, 1))
	period, err := GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	applied, err := AddCreditUsage(period.Id, 1200, 0, true)
	require.NoError(t, err)
	require.True(t, applied)
	prepaidUser := createEnterpriseTestUser(t, "prepaid1", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(prepaidUser.Id, &Enterprise{Name: "Initech"}))

	items, total, err := ListEnterprises("", "", 0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(2), total)
	byName := map[string]*EnterpriseListItem{}
	for _, item := range items {
		byName[item.Name] = item
	}
	assert.Equal(t, int64(5000), byName["Globex"].PeriodLimitQuota)
	assert.Equal(t, int64(1200), byName["Globex"].PeriodUsedQuota)
	assert.Equal(t, period.StartAt, byName["Globex"].PeriodStartAt)
	assert.Equal(t, period.EndAt, byName["Globex"].PeriodEndAt)
	assert.Equal(t, int64(0), byName["Initech"].PeriodLimitQuota)
	assert.Equal(t, int64(0), byName["Initech"].PeriodUsedQuota)
	assert.Equal(t, int64(0), byName["Initech"].PeriodEndAt)
}

func TestEnterpriseCreditPeriodsAndUsage(t *testing.T) {
	setupEnterprisePostgres(t)
	owner := createEnterpriseTestUser(t, "creditowner", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Credit Co"}))
	ent, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)

	// 预付企业没有账期；开通授信后立刻有一个 open 期，额度即配置值
	_, err = GetOpenCreditPeriod(ent.Id)
	assert.ErrorIs(t, err, ErrEnterpriseCreditNoOpenPeriod)
	assert.ErrorIs(t, ConfigureEnterpriseCredit(ent.Id, EnterpriseCreditConfig{CycleType: "weekly"}, 1), ErrEnterpriseCreditConfig)
	require.NoError(t, ConfigureEnterpriseCredit(ent.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleFixedDays, CycleDays: 30, LimitQuota: 1000}, 1))
	period, err := GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	assert.Equal(t, 1, period.PeriodNo)
	assert.Equal(t, int64(1000), period.LimitQuota)
	assert.Equal(t, period.StartAt+30*86400, period.EndAt)
	info, err := GetEnterpriseBillingInfo(owner.Id)
	require.NoError(t, err)
	assert.Equal(t, EnterpriseBillingModeCredit, info.BillingMode)
	assert.Equal(t, period.Id, info.OpenPeriodId)

	// 额度内预扣成功并计入在途，同一条 UPDATE 用 RETURNING 带回更新后的计数；超额预扣失败且不改变计数
	ok, state, err := AddCreditUsageReturning(period.Id, 600, 1, true)
	require.NoError(t, err)
	assert.True(t, ok)
	assert.Equal(t, CreditUsageState{PeriodId: period.Id, UsedQuota: 600, LimitQuota: 1000}, state)
	ok, state, err = AddCreditUsageReturning(period.Id, 500, 1, true)
	require.NoError(t, err)
	assert.False(t, ok)
	assert.Zero(t, state)

	// 预警发送权：同一期同一档只能抢到一次；上调额度后 warn 可再抢，exhausted 保留
	claimed, err := ClaimCreditNotify(period.Id, CreditNotifyKindWarn, ent.Id)
	require.NoError(t, err)
	assert.True(t, claimed)
	claimed, err = ClaimCreditNotify(period.Id, CreditNotifyKindWarn, ent.Id)
	require.NoError(t, err)
	assert.False(t, claimed)
	claimed, err = ClaimCreditNotify(period.Id, CreditNotifyKindExhausted, ent.Id)
	require.NoError(t, err)
	assert.True(t, claimed)
	period, _ = GetCreditPeriodById(period.Id)
	assert.Equal(t, int64(600), period.UsedQuota)
	assert.Equal(t, 1, period.InflightCount)

	// 上调额度立即作用于当前期，之前失败的预扣现在成功；warn 发送记录被清、exhausted 保留
	require.NoError(t, ConfigureEnterpriseCredit(ent.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleFixedDays, CycleDays: 30, LimitQuota: 2000, AlertPercent: 90}, 1))
	stored, err := GetEnterpriseById(ent.Id)
	require.NoError(t, err)
	assert.Equal(t, 90, stored.CreditAlertPercent)
	claimed, err = ClaimCreditNotify(period.Id, CreditNotifyKindWarn, ent.Id)
	require.NoError(t, err)
	assert.True(t, claimed, "raising the limit re-arms the warn notification")
	claimed, err = ClaimCreditNotify(period.Id, CreditNotifyKindExhausted, ent.Id)
	require.NoError(t, err)
	assert.False(t, claimed)
	assert.ErrorIs(t, ConfigureEnterpriseCredit(ent.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleFixedDays, CycleDays: 30, LimitQuota: 2000, AlertPercent: 100}, 1), ErrEnterpriseCreditConfig)
	ok, err = AddCreditUsage(period.Id, 500, 1, true)
	require.NoError(t, err)
	assert.True(t, ok)
	// 结算差额不受额度限制（允许超额），并释放在途
	ok, err = AddCreditUsage(period.Id, 1500, -1, false)
	require.NoError(t, err)
	assert.True(t, ok)
	period, _ = GetCreditPeriodById(period.Id)
	assert.Equal(t, int64(2600), period.UsedQuota)
	assert.Equal(t, 1, period.InflightCount)

	// 到期滚动（模拟时间前进 30 天：锚点与账期整体后移）：旧期 closing，新期 open 且连续；在途结算仍可记到 closing 期
	const shift = int64(30 * 86400)
	require.NoError(t, DB.Model(&Enterprise{}).Where("id = ?", ent.Id).Update("credit_anchor_at", gorm.Expr("credit_anchor_at - ?", shift)).Error)
	require.NoError(t, DB.Model(&EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{
		"start_at": gorm.Expr("start_at - ?", shift), "end_at": gorm.Expr("end_at - ?", shift),
	}).Error)
	rolled, err := RolloverDueCreditPeriods(common.GetTimestamp())
	require.NoError(t, err)
	assert.Equal(t, 1, rolled)
	previous, _ := GetCreditPeriodById(period.Id)
	assert.Equal(t, EnterpriseCreditPeriodClosing, previous.Status)
	next, err := GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	assert.Equal(t, 2, next.PeriodNo)
	assert.Equal(t, previous.EndAt, next.StartAt)
	assert.Equal(t, next.StartAt+shift, next.EndAt)
	assert.Equal(t, int64(2000), next.LimitQuota)
	assert.Equal(t, int64(0), next.UsedQuota)
	ok, err = AddCreditUsage(previous.Id, 100, -1, false)
	require.NoError(t, err)
	assert.True(t, ok)
	ok, err = AddCreditUsage(previous.Id, 1, 1, true)
	require.NoError(t, err)
	assert.False(t, ok, "closing period must not accept new pre-consume")

	// 已出账的期再收到结算差额：记入当前 open 期并写跨期调整流水
	require.NoError(t, DB.Model(&EnterpriseCreditPeriod{}).Where("id = ?", previous.Id).Update("status", EnterpriseCreditPeriodBilled).Error)
	carried, err := ApplyCreditSettlement(ent.Id, previous.Id, 70, 0)
	require.NoError(t, err)
	assert.Equal(t, next.Id, carried.PeriodId, "settlement after billing lands on the open period")
	assert.Equal(t, int64(70), carried.UsedQuota)
	next, _ = GetCreditPeriodById(next.Id)
	assert.Equal(t, int64(70), next.UsedQuota)
	entries, total, err := ListEnterpriseLedger(ent.Id, EnterpriseLedgerCrossPeriodAdjustment, 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, int64(70), entries[0].AmountQuota)

	// 授信企业不能登记充值；切回预付后 open 期转为 closing
	_, err = RegisterEnterpriseTopup(ent.Id, 100, 1, "", "")
	assert.ErrorIs(t, err, ErrEnterpriseNotPrepaid)
	require.NoError(t, SwitchEnterpriseToPrepaid(ent.Id, 1))
	_, err = GetOpenCreditPeriod(ent.Id)
	assert.ErrorIs(t, err, ErrEnterpriseCreditNoOpenPeriod)
	info, _ = GetEnterpriseBillingInfo(owner.Id)
	assert.Equal(t, EnterpriseBillingModePrepaid, info.BillingMode)
}

func TestEnterpriseTopupAndStatus(t *testing.T) {
	setupEnterprisePostgres(t)
	owner := createEnterpriseTestUser(t, "topupowner", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Topup Co"}))
	ent, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)

	entry, err := RegisterEnterpriseTopup(ent.Id, 250, 9, "WIRE-001", "Oct top-up")
	require.NoError(t, err)
	assert.Equal(t, int64(1250), entry.BalanceAfterQuota)
	quota, err := GetUserQuota(owner.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 1250, quota)
	_, err = RegisterEnterpriseTopup(ent.Id, 0, 9, "", "")
	assert.Error(t, err)
	entries, total, err := ListEnterpriseLedger(ent.Id, "", 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "WIRE-001", entries[0].Reference)

	require.NoError(t, SetEnterpriseStatus(ent.Id, EnterpriseStatusSuspended))
	info, err := GetEnterpriseBillingInfo(owner.Id)
	require.NoError(t, err)
	assert.Equal(t, EnterpriseStatusSuspended, info.Status)
	assert.Error(t, SetEnterpriseStatus(ent.Id, "paused"))
	assert.ErrorIs(t, SetEnterpriseStatus(ent.Id+100, EnterpriseStatusActive), ErrEnterpriseResourceNotFound)
	nonEnterprise, err := GetEnterpriseBillingInfo(999999)
	require.NoError(t, err)
	assert.Nil(t, nonEnterprise)
}

func TestEnterpriseCreditBillLifecycle(t *testing.T) {
	setupEnterprisePostgres(t)
	owner := createEnterpriseTestUser(t, "billowner", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Bill Co", ContactEmail: "ap@bill.co", PaymentTermsDays: 10}))
	ent, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	require.NoError(t, ConfigureEnterpriseCredit(ent.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleNaturalMonth, LimitQuota: 10_000_000}, 1))
	period, err := GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	token := &Token{UserId: owner.Id, Name: "k", Key: "billkey00000000000000000000000000000000000000001", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, CreateEnterpriseToken(ent.Id, EnterpriseScope{}, token, 0, 0))
	InvalidateEnterpriseBillingInfo(owner.Id)

	// 本期消费 1,000,000 quota（$2），明细比计数器少 100（模拟聚合丢失一条）
	ok, err := AddCreditUsage(period.Id, 1_000_000, 1, true)
	require.NoError(t, err)
	require.True(t, ok)
	require.NoError(t, RecordEnterpriseUsage(EnterpriseUsageEvent{UserId: owner.Id, TokenId: token.Id, ModelName: "gpt-4o", Quota: 999_900, CreatedAt: common.GetTimestamp(), CreditPeriodId: period.Id}))

	// 在途未清零且未超时：不出账
	require.NoError(t, DB.Model(&EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{"status": EnterpriseCreditPeriodClosing, "closed_at": common.GetTimestamp()}).Error)
	ready, err := FindClosingPeriodsReadyToBill(common.GetTimestamp())
	require.NoError(t, err)
	assert.Empty(t, ready)
	_, err = IssueCreditBill(period.Id)
	require.NoError(t, err, "manual issue is allowed while closing")
	// 重新构造：在途清零后自动出账
	require.NoError(t, DB.Model(&EnterpriseCreditPeriod{}).Where("id = ?", period.Id).Updates(map[string]any{"status": EnterpriseCreditPeriodClosing, "bill_id": 0, "inflight_count": 0}).Error)
	require.NoError(t, DB.Where("enterprise_id = ?", ent.Id).Delete(&EnterpriseBill{}).Error)
	require.NoError(t, DB.Where("enterprise_id = ? AND type = ?", ent.Id, EnterpriseLedgerBillIssued).Delete(&EnterpriseLedgerEntry{}).Error)
	ready, err = FindClosingPeriodsReadyToBill(common.GetTimestamp())
	require.NoError(t, err)
	require.Len(t, ready, 1)
	bill, err := IssueCreditBill(period.Id)
	require.NoError(t, err)
	require.NotNil(t, bill)
	assert.Regexp(t, `^TF-\d{6}-\d{6}$`, bill.BillNo)
	assert.Equal(t, int64(1_000_000), bill.AmountQuota)
	assert.Equal(t, "2", bill.TotalUSD.String())
	assert.Equal(t, int64(100), bill.ReconcileDiffQuota)
	assert.Equal(t, EnterpriseBillUnpaid, bill.Status)
	assert.Equal(t, bill.IssuedAt+10*86400, bill.DueAt)
	assert.Contains(t, string(bill.UsageSnapshot), "gpt-4o")
	assert.Contains(t, string(bill.BuyerSnapshot), "Bill Co")
	billed, _ := GetCreditPeriodById(period.Id)
	assert.Equal(t, EnterpriseCreditPeriodBilled, billed.Status)
	assert.Equal(t, bill.Id, billed.BillId)
	again, err := IssueCreditBill(period.Id)
	require.NoError(t, err)
	assert.Equal(t, bill.Id, again.Id, "issuing twice must return the same bill")

	// 对账差异：待处理列表 / 差异筛选 / 标记已核对（幂等，不覆盖首次备注）
	alerts, total, err := ListReconcileAlerts(ReconcileAlertStatePending, 0, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	assert.Equal(t, bill.Id, alerts[0].BillId)
	assert.Equal(t, "Bill Co", alerts[0].EnterpriseName)
	assert.Equal(t, int64(999_900), alerts[0].DetailTotalQuota)
	assert.Equal(t, int64(100), alerts[0].ReconcileDiffQuota)
	_, total, err = ListEnterpriseBills(EnterpriseBillFilter{ReconcileDiffOnly: true}, 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	_, _, err = ListReconcileAlerts("bogus", 0, 0, 10)
	assert.ErrorIs(t, err, ErrReconcileAlertState)
	acked, err := AckReconcileAlert(bill.Id, 9, "  checked against raw logs  ")
	require.NoError(t, err)
	assert.Equal(t, 9, acked.ReconcileAckedBy)
	assert.Equal(t, "checked against raw logs", acked.ReconcileAckNote)
	assert.NotZero(t, acked.ReconcileAckedAt)
	ackedAgain, err := AckReconcileAlert(bill.Id, 10, "someone else")
	require.NoError(t, err)
	assert.Equal(t, 9, ackedAgain.ReconcileAckedBy, "second ack is a no-op")
	assert.Equal(t, acked.ReconcileAckedAt, ackedAgain.ReconcileAckedAt)
	_, total, err = ListReconcileAlerts(ReconcileAlertStatePending, 0, 0, 10)
	require.NoError(t, err)
	assert.Zero(t, total)
	_, total, err = ListReconcileAlerts(ReconcileAlertStateAcked, ent.Id, 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	_, err = AckReconcileAlert(bill.Id+1000, 9, "")
	assert.ErrorIs(t, err, ErrEnterpriseResourceNotFound)
	entries, _, err := ListEnterpriseLedger(ent.Id, EnterpriseLedgerBillIssued, 0, 10)
	require.NoError(t, err)
	require.Len(t, entries, 1)
	assert.Equal(t, bill.BillNo, entries[0].Reference)

	// 收款：部分 → 超额拒绝 → 结清；结清后不能作废
	paid, err := RegisterBillPayment(bill.Id, decimal.NewFromFloat(0.5), 9, "WIRE-1", "")
	require.NoError(t, err)
	assert.Equal(t, EnterpriseBillPartiallyPaid, paid.Status)
	_, err = RegisterBillPayment(bill.Id, decimal.NewFromFloat(1.6), 9, "", "")
	assert.ErrorIs(t, err, ErrEnterpriseBillOverpaid)
	paid, err = RegisterBillPayment(bill.Id, decimal.NewFromFloat(1.5), 9, "WIRE-2", "")
	require.NoError(t, err)
	assert.Equal(t, EnterpriseBillPaid, paid.Status)
	assert.True(t, paid.Outstanding().IsZero())
	assert.ErrorIs(t, VoidBill(bill.Id, 9, "dup"), ErrEnterpriseBillNotPayable)

	// 零消费的 closing 期：不出账单，直接 billed
	require.NoError(t, ConfigureEnterpriseCredit(ent.Id, EnterpriseCreditConfig{CycleType: EnterpriseCreditCycleNaturalMonth, LimitQuota: 10_000_000}, 1))
	empty, err := GetOpenCreditPeriod(ent.Id)
	require.NoError(t, err)
	require.NoError(t, DB.Model(&EnterpriseCreditPeriod{}).Where("id = ?", empty.Id).Updates(map[string]any{"status": EnterpriseCreditPeriodClosing, "closed_at": common.GetTimestamp()}).Error)
	noBill, err := IssueCreditBill(empty.Id)
	require.NoError(t, err)
	assert.Nil(t, noBill)
	emptyAfter, _ := GetCreditPeriodById(empty.Id)
	assert.Equal(t, EnterpriseCreditPeriodBilled, emptyAfter.Status)
	assert.Zero(t, emptyAfter.BillId)
}

func TestEnterpriseBillRemindersAndStatements(t *testing.T) {
	setupEnterprisePostgres(t)
	owner := createEnterpriseTestUser(t, "stmtowner", common.RoleCommonUser)
	require.NoError(t, UpgradeUserToEnterprise(owner.Id, &Enterprise{Name: "Stmt Co"}))
	ent, err := GetEnterpriseByUserId(owner.Id)
	require.NoError(t, err)
	now := common.GetTimestamp()
	newBill := func(dueOffsetDays int, status string) *EnterpriseBill {
		bill := &EnterpriseBill{EnterpriseId: ent.Id, BillType: EnterpriseBillTypeCredit, Status: status, TotalUSD: decimal.NewFromInt(10),
			IssuedAt: now - 20*86400, DueAt: now - int64(dueOffsetDays)*86400 - 60, CreatedAt: now, UpdatedAt: now}
		require.NoError(t, DB.Create(bill).Error)
		require.NoError(t, DB.Model(bill).Update("bill_no", enterpriseBillNo(now, bill.Id)).Error)
		return bill
	}
	dueToday := newBill(0, EnterpriseBillUnpaid)
	overdue3 := newBill(3, EnterpriseBillPartiallyPaid)
	overdue2 := newBill(2, EnterpriseBillUnpaid)
	paidOld := newBill(7, EnterpriseBillPaid)
	due, err := FindBillsDueForReminder(now)
	require.NoError(t, err)
	ids := []int64{}
	for _, bill := range due {
		ids = append(ids, bill.Id)
	}
	assert.ElementsMatch(t, []int64{dueToday.Id, overdue3.Id}, ids, "only day 0/1/3/7/14 are reminded; paid bills never")
	_ = overdue2
	_ = paidOld
	require.NoError(t, MarkBillReminded(dueToday.Id, now))
	due, err = FindBillsDueForReminder(now)
	require.NoError(t, err)
	assert.Len(t, due, 1, "a bill is reminded at most once per day")
	reminded, _ := GetEnterpriseBill(dueToday.Id)
	assert.Equal(t, 1, reminded.ReminderCount)
	assert.True(t, overdue3.IsOverdue(now))
	assert.False(t, paidOld.IsOverdue(now))

	// 预付月度对账单：上月充值 300、消耗 120，当前余额 1000 → 期初 820；重复生成不新建
	current := time.Unix(now, 0).In(enterpriseBillingLocation)
	monthStart := time.Date(current.Year(), current.Month(), 1, 0, 0, 0, 0, enterpriseBillingLocation)
	lastMonth := monthStart.AddDate(0, -1, 0)
	require.NoError(t, DB.Create(&EnterpriseLedgerEntry{EnterpriseId: ent.Id, Type: EnterpriseLedgerTopup, AmountQuota: 300, CreatedAt: lastMonth.Unix() + 3600}).Error)
	require.NoError(t, DB.Create(&EnterpriseUsageDaily{Day: lastMonth.AddDate(0, 0, 2).Format("2006-01-02"), EnterpriseId: ent.Id, TokenId: 1, ModelName: "m", RequestCount: 1, Quota: 120, UpdatedAt: now}).Error)
	created, err := GenerateMonthlyStatements(now)
	require.NoError(t, err)
	assert.Equal(t, 1, created)
	created, err = GenerateMonthlyStatements(now)
	require.NoError(t, err)
	assert.Equal(t, 0, created)
	statements, total, err := ListEnterpriseBills(EnterpriseBillFilter{EnterpriseId: ent.Id, BillType: EnterpriseBillTypeStatement}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	assert.Regexp(t, `^ST-\d{6}-\d{6}$`, statements[0].BillNo)
	assert.Equal(t, lastMonth.Unix(), statements[0].PeriodStart)
	var snapshot map[string]int64
	require.NoError(t, common.Unmarshal(statements[0].UsageSnapshot, &snapshot))
	assert.Equal(t, map[string]int64{"opening_quota": 820, "topup_quota": 300, "consumption_quota": 120, "adjustment_quota": 0, "closing_quota": 1000}, snapshot)
}

func TestEnterpriseTrialLeadLifecycle(t *testing.T) {
	setupEnterprisePostgres(t)

	// 校验：公司名为空 / 联系方式过短 / 用量档位非法
	require.ErrorIs(t, CreateEnterpriseTrialLead(&EnterpriseTrialLead{Company: " ", Contact: "wx_123456"}), ErrEnterpriseLeadInvalid)
	require.ErrorIs(t, CreateEnterpriseTrialLead(&EnterpriseTrialLead{Company: "Acme", Contact: "1234"}), ErrEnterpriseLeadInvalid)
	require.ErrorIs(t, CreateEnterpriseTrialLead(&EnterpriseTrialLead{Company: "Acme", Contact: "wx_123456", Volume: "huge"}), ErrEnterpriseLeadInvalid)

	lead := &EnterpriseTrialLead{Company: "  Acme Inc  ", Contact: "wx_123456", Volume: "1k_10k", ClientIP: "10.0.0.1", Status: "closed"}
	require.NoError(t, CreateEnterpriseTrialLead(lead))
	assert.Equal(t, "Acme Inc", lead.Company)
	assert.Equal(t, EnterpriseLeadStatusNew, lead.Status, "客户端不能预设状态")
	assert.NotZero(t, lead.CreatedAt)

	count, err := CountRecentEnterpriseTrialLeadsByIP("10.0.0.1")
	require.NoError(t, err)
	assert.Equal(t, int64(1), count)

	leads, total, err := ListEnterpriseTrialLeads(EnterpriseLeadStatusNew, 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, leads, 1)

	require.NoError(t, UpdateEnterpriseTrialLeadStatus(lead.Id, EnterpriseLeadStatusContacted, " 已加微信 "))
	leads, _, err = ListEnterpriseTrialLeads(EnterpriseLeadStatusContacted, 0, 10)
	require.NoError(t, err)
	require.Len(t, leads, 1)
	assert.Equal(t, "已加微信", leads[0].Remark)

	require.ErrorIs(t, UpdateEnterpriseTrialLeadStatus(lead.Id, "bogus", ""), ErrEnterpriseLeadInvalid)
	require.ErrorIs(t, UpdateEnterpriseTrialLeadStatus(lead.Id+999, EnterpriseLeadStatusClosed, ""), gorm.ErrRecordNotFound)
}
