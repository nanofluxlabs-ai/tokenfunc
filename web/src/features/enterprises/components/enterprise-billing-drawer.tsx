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
import {
  CreditPeriodsTable,
  LedgerTable,
} from '@/features/enterprise-console/components/billing-tables'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  disableEnterpriseCredit,
  getEnterprise,
  listEnterpriseCreditPeriods,
  listEnterpriseLedger,
  setEnterpriseStatus,
} from '../api'
import type { EnterpriseListItem } from '../types'
import { CreditConfigForm } from './credit-config-form'
import { useEnterprises } from './enterprises-provider'
import { TopupForm } from './topup-form'

type EnterpriseBillingDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: EnterpriseListItem
}

/** 管理员：企业计费管理（计费模式、授信配置、线下充值、停用、流水） */
export function EnterpriseBillingDrawer(props: EnterpriseBillingDrawerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { triggerRefresh } = useEnterprises()
  const enterpriseId = props.currentRow?.id ?? 0
  const [confirm, setConfirm] = useState<
    'suspend' | 'activate' | 'disable_credit' | null
  >(null)

  const enterprise = useQuery({
    queryKey: ['admin-enterprise', enterpriseId],
    queryFn: async () =>
      requireServerSuccess(await getEnterprise(enterpriseId)).data ?? null,
    enabled: props.open && enterpriseId > 0,
  })
  const ledger = useQuery({
    queryKey: ['admin-enterprise', enterpriseId, 'ledger'],
    queryFn: async () =>
      requireServerSuccess(
        await listEnterpriseLedger(enterpriseId, { page_size: 20 })
      ).data?.items ?? [],
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

  const handleConfirm = async () => {
    if (!confirm || !enterprise.data) return
    try {
      const result =
        confirm === 'disable_credit'
          ? await disableEnterpriseCredit(enterpriseId)
          : await setEnterpriseStatus(
              enterpriseId,
              confirm === 'suspend' ? 'suspended' : 'active'
            )
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
  const confirmCopy = {
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
    disable_credit: {
      title: t('Switch to prepaid'),
      desc: t(
        'The current credit period will be closed and billed. Future usage is paid from the balance.'
      ),
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
                    'Prepaid billing: usage is deducted from the balance; top-ups are registered here after bank transfer.'
                  )}
            </SheetDescription>
          </SheetHeader>
          <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-4'>
            {data && (
              <SideDrawerSection>
                <SideDrawerSectionHeader title={t('Account')} />
                <div className='flex flex-wrap items-center gap-3 text-sm'>
                  {!isCredit && (
                    <span>
                      {t('Balance')}:{' '}
                      <span className='font-mono'>
                        {formatQuotaWithCurrency(props.currentRow?.quota)}
                      </span>
                    </span>
                  )}
                  <div className='flex-1' />
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
            {data && !isCredit && (
              <SideDrawerSection>
                <SideDrawerSectionHeader
                  title={t('Register top-up')}
                  description={t(
                    'Record an offline bank transfer and add it to the balance.'
                  )}
                />
                <TopupForm enterpriseId={enterpriseId} onSaved={refresh} />
              </SideDrawerSection>
            )}
            {data && (
              <SideDrawerSection>
                <SideDrawerSectionHeader
                  title={
                    isCredit
                      ? t('Credit configuration')
                      : t('Enable credit billing')
                  }
                  description={
                    isCredit
                      ? t(
                          'Credit replaces the prepaid balance; unpaid bills do not block the next period.'
                        )
                      : t(
                          'Switch this enterprise to credit billing with a per-period limit.'
                        )
                  }
                />
                <CreditConfigForm enterprise={data} onSaved={refresh} />
                {isCredit && (
                  <div className='flex justify-end'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setConfirm('disable_credit')}
                    >
                      {t('Switch to prepaid')}
                    </Button>
                  </div>
                )}
              </SideDrawerSection>
            )}
            {isCredit && (
              <SideDrawerSection>
                <SideDrawerSectionHeader title={t('Credit Periods')} />
                <CreditPeriodsTable
                  periods={periods.data ?? []}
                  isLoading={periods.isLoading}
                />
              </SideDrawerSection>
            )}
            <SideDrawerSection>
              <SideDrawerSectionHeader title={t('Ledger')} />
              <LedgerTable
                entries={ledger.data ?? []}
                isLoading={ledger.isLoading}
              />
            </SideDrawerSection>
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
    </>
  )
}
