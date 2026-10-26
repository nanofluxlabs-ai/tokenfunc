import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { CreditPeriodsTable } from '@/features/enterprise-console/components/billing-tables'
import { UsagePanel } from '@/features/enterprise-console/components/usage-panel'
import { isCreditAwaitingPayment } from '@/features/enterprise-console/lib/credit-period'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  adminUsageExportUrl,
  getEnterprise,
  getEnterpriseUsageSummary,
  issueBillNow,
  listEnterpriseCreditPeriods,
  openCreditPeriod,
  setEnterpriseStatus,
} from '../api'
import type { EnterpriseListItem } from '../types'
import { AdjustmentDialog } from './adjustment-dialog'
import { useEnterprises } from './enterprises-provider'

type EnterpriseBillingDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: EnterpriseListItem
}

/** 管理员：企业计费管理（账户、授信账期、调账、停用、流水、用量）；计费模式与授信配置在编辑抽屉里改 */
export function EnterpriseBillingDrawer(props: EnterpriseBillingDrawerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { triggerRefresh, setOpen } = useEnterprises()
  const enterpriseId = props.currentRow?.id ?? 0
  const [confirm, setConfirm] = useState<
    'suspend' | 'activate' | 'open_period' | null
  >(null)
  const [adjustOpen, setAdjustOpen] = useState(false)

  const enterprise = useQuery({
    queryKey: ['admin-enterprise', enterpriseId],
    queryFn: async () =>
      requireServerSuccess(await getEnterprise(enterpriseId)).data ?? null,
    enabled: props.open && enterpriseId > 0,
  })
  const isCredit = enterprise.data?.billing_mode === 'credit'
  const periods = useQuery({
    queryKey: ['admin-enterprise', enterpriseId, 'credit-periods'],
    queryFn: async () =>
      requireServerSuccess(
        await listEnterpriseCreditPeriods(enterpriseId, { page_size: 12 })
      ).data?.items ?? [],
    enabled: props.open && enterpriseId > 0 && isCredit,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ['admin-enterprise', enterpriseId],
    })
    triggerRefresh()
  }

  const handleIssueNow = async (periodId: number) => {
    try {
      const result = await issueBillNow(periodId)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(
        result.data
          ? t('Bill {{billNo}} issued', { billNo: result.data.bill_no })
          : t('Period closed without usage')
      )
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  const runConfirmedAction = () => {
    if (confirm === 'open_period') {
      return openCreditPeriod(enterpriseId)
    }
    return setEnterpriseStatus(
      enterpriseId,
      confirm === 'suspend' ? 'suspended' : 'active'
    )
  }

  const handleConfirm = async () => {
    if (!confirm || !enterprise.data) return
    try {
      const result = await runConfirmedAction()
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Updated'))
      setConfirm(null)
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  const data = enterprise.data
  const isSuspended = data?.status === 'suspended'
  const awaitingPayment =
    data !== undefined &&
    data !== null &&
    isCredit &&
    periods.isSuccess &&
    isCreditAwaitingPayment(
      data,
      periods.data.some((period) => period.status === 'open')
    )
  const confirmCopy = {
    open_period: {
      title: t('Open next period'),
      desc: t(
        'A new credit period starts immediately without waiting for the bill to be paid.'
      ),
    },
    suspend: {
      title: t('Suspend enterprise'),
      desc: t(
        'All API keys of this enterprise will be rejected until it is activated again.'
      ),
    },
    activate: {
      title: t('Activate enterprise'),
      desc: t('API keys of this enterprise will work again.'),
    },
  }

  return (
    <>
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-[720px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle className='flex items-center gap-2'>
              {t('Billing')} · {props.currentRow?.name}
              {data && (
                <StatusBadge
                  label={isSuspended ? t('Suspended') : t('Active')}
                  variant={isSuspended ? 'danger' : 'success'}
                  copyable={false}
                />
              )}
            </SheetTitle>
            <SheetDescription>
              {isCredit
                ? t(
                    'Credit billing: usage is limited per period and billed when the period ends.'
                  )
                : t(
                    'Prepaid billing: usage is deducted from the balance; register offline top-ups with the Top-up action on the enterprise row.'
                  )}
            </SheetDescription>
          </SheetHeader>
          <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-4'>
            {data && (
              <SideDrawerSection>
                <SideDrawerSectionHeader title={t('Account')} />
                <div className='flex flex-wrap items-center gap-3 text-sm'>
                  {/* 预付看余额；授信看本期额度与已用，避免左侧空着只剩一个按钮 */}
                  {isCredit ? (
                    <span className='flex flex-wrap items-center gap-x-3'>
                      <span>
                        {t('Credit Limit')}:{' '}
                        <span className='font-mono'>
                          {props.currentRow?.period_limit_quota
                            ? formatQuotaWithCurrency(
                                props.currentRow.period_limit_quota
                              )
                            : '—'}
                        </span>
                      </span>
                      <span>
                        {t('Used')}:{' '}
                        <span className='font-mono'>
                          {formatQuotaWithCurrency(
                            props.currentRow?.period_used_quota ?? 0
                          )}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span>
                      {t('Balance')}:{' '}
                      <span className='font-mono'>
                        {formatQuotaWithCurrency(props.currentRow?.quota)}
                      </span>
                    </span>
                  )}
                  <div className='flex-1' />
                  {/* currentRow 仍是这一行，切到 update 即打开同一企业的编辑抽屉 */}
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setOpen('update')}
                  >
                    {t('Change billing settings')}
                  </Button>
                  {!isCredit && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setAdjustOpen(true)}
                    >
                      {t('Adjust balance')}
                    </Button>
                  )}
                  <Button
                    variant={isSuspended ? 'default' : 'destructive'}
                    size='sm'
                    onClick={() =>
                      setConfirm(isSuspended ? 'activate' : 'suspend')
                    }
                  >
                    {isSuspended
                      ? t('Activate enterprise')
                      : t('Suspend enterprise')}
                  </Button>
                </div>
              </SideDrawerSection>
            )}
            {isCredit && (
              <SideDrawerSection>
                <SideDrawerSectionHeader title={t('Credit Periods')} />
                {awaitingPayment && (
                  <div className='flex flex-wrap items-center gap-3 text-sm'>
                    <StatusBadge
                      label={t('Awaiting payment')}
                      variant='warning'
                      copyable={false}
                    />
                    <span className='text-muted-foreground'>
                      {t(
                        'The limit was used up and billed; requests are rejected until the bill is paid.'
                      )}
                    </span>
                    <div className='flex-1' />
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setConfirm('open_period')}
                    >
                      {t('Open next period')}
                    </Button>
                  </div>
                )}
                <CreditPeriodsTable
                  periods={periods.data ?? []}
                  isLoading={periods.isLoading}
                  onIssueNow={(period) => void handleIssueNow(period.id)}
                />
              </SideDrawerSection>
            )}
            {enterpriseId > 0 && (
              <SideDrawerSection>
                <SideDrawerSectionHeader title={t('Usage Report')} />
                <UsagePanel
                  queryKey={['admin-enterprise', enterpriseId]}
                  fetchSummary={(params) =>
                    getEnterpriseUsageSummary(enterpriseId, params)
                  }
                  exportUrl={adminUsageExportUrl(enterpriseId)}
                />
              </SideDrawerSection>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? confirmCopy[confirm].title : ''}
        desc={confirm ? confirmCopy[confirm].desc : ''}
        destructive={confirm === 'suspend'}
        confirmText={t('Confirm')}
        handleConfirm={() => void handleConfirm()}
      />
      <AdjustmentDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        enterpriseId={enterpriseId}
        balanceQuota={props.currentRow?.quota}
        onSaved={refresh}
      />
    </>
  )
}
