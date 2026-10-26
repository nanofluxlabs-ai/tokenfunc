import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Ban, HandCoins, Scale, Settings2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SimplePager } from '@/components/simple-pager'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { BillsTable } from '@/features/enterprise-console/components/bills-table'
import type { Bill } from '@/features/enterprise-console/types'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listAdminBills, voidBill } from '../api'
import { AdjustmentDialog } from './adjustment-dialog'
import { BillPaymentDialog } from './bill-payment-dialog'
import { SellerProfileDialog } from './seller-profile-dialog'

const PAGE_SIZE = 20
type Filter = 'all' | 'unpaid' | 'overdue' | 'paid' | 'statement' | 'reconcile'

/** 企业账单管理（列表 + 收款 / 作废 + 开票方设置）；在财务中心的「企业账单」tab 内渲染 */
export function BillsAdminContent(props: {
  /** 账单号的渲染（财务中心：链接到账单详情） */
  renderBillNo?: (bill: Bill) => ReactNode
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [sellerOpen, setSellerOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('unpaid')
  const [page, setPage] = useState(1)
  const [paying, setPaying] = useState<Bill | null>(null)
  const [adjusting, setAdjusting] = useState<Bill | null>(null)
  const [voiding, setVoiding] = useState<Bill | null>(null)
  const [voidRemark, setVoidRemark] = useState('')

  const params = {
    all: {},
    unpaid: { status: 'unpaid' },
    overdue: { overdue: 'true' as const },
    paid: { status: 'paid' },
    statement: { bill_type: 'statement' },
    reconcile: { reconcile: 'diff' as const },
  }[filter]
  const { data, isLoading } = useQuery({
    queryKey: ['admin-enterprise', 'bills', filter, page],
    queryFn: async () =>
      requireServerSuccess(
        await listAdminBills({ ...params, p: page, page_size: PAGE_SIZE })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin-enterprise'] })

  const handleVoid = async () => {
    if (!voiding) return
    try {
      const result = await voidBill(voiding.id, voidRemark)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Bill voided'))
      setVoiding(null)
      setVoidRemark('')
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Tabs
          value={filter}
          onValueChange={(value) => {
            setFilter(value as Filter)
            setPage(1)
          }}
        >
          <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
            <TabsTrigger value='unpaid'>{t('Unpaid')}</TabsTrigger>
            <TabsTrigger value='overdue'>{t('Overdue')}</TabsTrigger>
            <TabsTrigger value='paid'>{t('Paid')}</TabsTrigger>
            <TabsTrigger value='statement'>
              {t('Monthly statement')}
            </TabsTrigger>
            <TabsTrigger value='reconcile'>
              {t('Reconciliation diff')}
            </TabsTrigger>
            <TabsTrigger value='all'>{t('All')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className='flex-1' />
        <Button variant='outline' size='sm' onClick={() => setSellerOpen(true)}>
          <Settings2 className='h-4 w-4' />
          {t('Invoice issuer settings')}
        </Button>
      </div>
      <BillsTable
        bills={data?.items ?? []}
        isLoading={isLoading}
        exportScope='admin'
        showEnterprise
        showReconcile
        renderBillNo={props.renderBillNo}
        renderActions={(bill) =>
          bill.bill_type === 'credit' &&
          (bill.status === 'unpaid' || bill.status === 'partially_paid') ? (
            <>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('Register payment')}
                onClick={() => setPaying(bill)}
              >
                <HandCoins />
              </Button>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('Adjust bill')}
                onClick={() => setAdjusting(bill)}
              >
                <Scale />
              </Button>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('Void bill')}
                onClick={() => setVoiding(bill)}
              >
                <Ban />
              </Button>
            </>
          ) : null
        }
      />
      <SimplePager
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
      />
      <BillPaymentDialog
        bill={paying}
        onOpenChange={(open) => !open && setPaying(null)}
        onSaved={refresh}
      />
      <AdjustmentDialog
        open={adjusting !== null}
        onOpenChange={(open) => !open && setAdjusting(null)}
        enterpriseId={adjusting?.enterprise_id ?? 0}
        bill={adjusting}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => {
          if (!open) {
            setVoiding(null)
            setVoidRemark('')
          }
        }}
        title={t('Void bill')}
        desc={
          voiding
            ? `${voiding.bill_no} · ${t('The bill will be cancelled and cannot be paid. The credit period stays billed.')}`
            : ''
        }
        destructive
        confirmText={t('Void bill')}
        disabled={voidRemark.trim() === ''}
        handleConfirm={() => void handleVoid()}
      >
        <Textarea
          value={voidRemark}
          onChange={(event) => setVoidRemark(event.target.value)}
          placeholder={t('Reason (required)')}
          rows={2}
          aria-label={t('Reason (required)')}
        />
      </ConfirmDialog>
      <SellerProfileDialog open={sellerOpen} onOpenChange={setSellerOpen} />
    </div>
  )
}
