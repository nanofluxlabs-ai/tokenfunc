import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { SettlementsTable } from '@/features/promoter-center/components/settlements-table'
import {
  promoterSettlementsKey,
  usePromoterSettlements,
} from '@/features/promoter-center/hooks/use-promoter-center-queries'
import type {
  PromoterScope,
  PromoterSettlementMonth,
} from '@/features/promoter-center/types'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { revertPromoterSettlement } from '../api'
import type { PromoterListItem } from '../types'
import { MarkSettledDialog } from './mark-settled-dialog'

type SettlementsSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  promoter: PromoterListItem | null
}

/** 管理员：某推广人创建月至今的逐月结算状态，可标记已结算 / 撤销 */
export function SettlementsSheet(props: SettlementsSheetProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const promoterId = props.promoter?.id ?? 0
  const scope: PromoterScope = { scope: 'admin', promoterId }
  const [marking, setMarking] = useState<PromoterSettlementMonth | null>(null)
  const [reverting, setReverting] = useState<PromoterSettlementMonth | null>(
    null
  )
  const settlements = usePromoterSettlements(
    scope,
    { all: true },
    props.open && promoterId > 0
  )
  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: promoterSettlementsKey(scope),
    })
  const pendingCount = (settlements.data ?? []).filter(
    (month) => month.settleable && !month.settled
  ).length

  const revert = useMutation({
    mutationFn: async (month: string) =>
      requireServerSuccess(await revertPromoterSettlement(promoterId, month)),
    onSuccess: () => {
      toast.success(t('Settlement reverted'))
      setReverting(null)
      refresh()
    },
    onError: (error) =>
      handleServerError(error, t('Failed to revert settlement')),
  })

  return (
    <>
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-[960px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>
              {t('Settlements')}
              {props.promoter && (
                <span className='text-muted-foreground ml-2 text-sm font-normal'>
                  {props.promoter.username}
                  <span className='ml-1 font-mono'>
                    #{props.promoter.user_id}
                  </span>
                </span>
              )}
            </SheetTitle>
            <SheetDescription>
              {t('Pending months: {{count}}', { count: pendingCount })}
            </SheetDescription>
          </SheetHeader>
          <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 sm:px-6'>
            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Monthly settlement')}
                description={t(
                  'Settlements are counted per full calendar month in the billing time zone; the date range only selects which months are listed.'
                )}
              />
              <SettlementsTable
                items={settlements.data ?? []}
                loading={settlements.isLoading}
                fetching={settlements.isFetching}
                showOperator
                actions={{ onMark: setMarking, onRevert: setReverting }}
                emptyTitle={t('No months in the selected range')}
              />
            </SideDrawerSection>
          </div>
        </SheetContent>
      </Sheet>
      <MarkSettledDialog
        promoterId={promoterId}
        month={marking}
        onOpenChange={(open) => !open && setMarking(null)}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={reverting !== null}
        onOpenChange={(open) => !open && setReverting(null)}
        title={t('Revert settlement')}
        desc={t(
          'Revert the settlement of {{month}} for {{username}}? The month goes back to pending.',
          {
            month: reverting?.month ?? '',
            username: props.promoter?.username ?? '',
          }
        )}
        destructive
        confirmText={t('Revert settlement')}
        isLoading={revert.isPending}
        handleConfirm={() => reverting && revert.mutate(reverting.month)}
      />
    </>
  )
}
