import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { PaginationState } from '@tanstack/react-table'
import { Ban, HandCoins, Scale, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  BillsTable,
  type BillsTableRow,
} from '@/features/enterprise-console/components/bills-table'
import type { Bill } from '@/features/enterprise-console/types'
import { voidBill } from '@/features/enterprises/api'
import { AdjustmentDialog } from '@/features/enterprises/components/adjustment-dialog'
import { BillPaymentDialog } from '@/features/enterprises/components/bill-payment-dialog'
import { SellerProfileDialog } from '@/features/enterprises/components/seller-profile-dialog'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listFinanceBills } from '../../api'
import { FINANCE_QUERY_KEY } from '../../constants'
import { formatBillRef } from '../../lib/bill-ref'
import type { FinanceBillSummary } from '../../types'

const DEFAULT_PAGE_SIZE = 20
const STATUS_ANY = 'all'

/** 状态下拉：账期状态、账单状态与两个账单视角（月度对账单 / 对账差异）放同一个列表，第一项为全部 */
const STATUS_OPTIONS: { value: string; labelKey: string }[] = [
  { value: STATUS_ANY, labelKey: 'All statuses' },
  { value: 'open', labelKey: 'In progress' },
  { value: 'closing', labelKey: 'Closing' },
  { value: 'unpaid', labelKey: 'Unpaid' },
  { value: 'partially_paid', labelKey: 'Partially paid' },
  { value: 'overdue', labelKey: 'Overdue' },
  { value: 'paid', labelKey: 'Paid' },
  { value: 'void', labelKey: 'Void' },
  { value: 'statement', labelKey: 'Monthly statement' },
  { value: 'reconcile', labelKey: 'Reconciliation diff' },
]

type BillFilters = { enterpriseName: string; billNo: string; status: string }
const EMPTY_FILTERS: BillFilters = {
  enterpriseName: '',
  billNo: '',
  status: STATUS_ANY,
}

/** 列表行：已出账行带完整账单，账期行用摘要 */
function toTableRow(summary: FinanceBillSummary): BillsTableRow {
  if (summary.kind === 'bill' && summary.bill) {
    return { kind: 'bill', bill: summary.bill }
  }
  return { kind: 'period', period: summary }
}

/** 企业账单 tab：查询条（企业名称 / 账单号 / 状态）+ 一张表（进行中账期在前、已出账账单在后）+ 收款 / 调账 / 作废 */
export function BillsPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<BillFilters>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<BillFilters>(EMPTY_FILTERS)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  })
  const [sellerOpen, setSellerOpen] = useState(false)
  const [paying, setPaying] = useState<Bill | null>(null)
  const [adjusting, setAdjusting] = useState<Bill | null>(null)
  const [voiding, setVoiding] = useState<Bill | null>(null)
  const [voidRemark, setVoidRemark] = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      FINANCE_QUERY_KEY,
      'bills',
      filters,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listFinanceBills({
          include_open: 1,
          enterprise_name: filters.enterpriseName || undefined,
          bill_no: filters.billNo || undefined,
          status: filters.status === STATUS_ANY ? undefined : filters.status,
          p: pagination.pageIndex + 1,
          page_size: pagination.pageSize,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0

  const applyFilters = (next: BillFilters) => {
    setFilters(next)
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: [FINANCE_QUERY_KEY] })

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
      <form
        className='flex flex-wrap items-center gap-2'
        onSubmit={(event) => {
          event.preventDefault()
          applyFilters(draft)
        }}
      >
        <Input
          className='w-44'
          placeholder={t('Enterprise name')}
          aria-label={t('Enterprise name')}
          value={draft.enterpriseName}
          onChange={(event) =>
            setDraft({ ...draft, enterpriseName: event.target.value })
          }
        />
        <Input
          className='w-44'
          placeholder={t('Bill No.')}
          aria-label={t('Bill No.')}
          value={draft.billNo}
          onChange={(event) =>
            setDraft({ ...draft, billNo: event.target.value })
          }
        />
        <div className='w-40'>
          <Select
            items={STATUS_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            value={draft.status}
            onValueChange={(value) =>
              setDraft({ ...draft, status: value ?? STATUS_ANY })
            }
          >
            <SelectTrigger
              aria-label={t('Filter by status')}
              className='w-full'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button type='submit' size='sm'>
          {t('Search')}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => {
            setDraft(EMPTY_FILTERS)
            applyFilters(EMPTY_FILTERS)
          }}
        >
          {t('Reset')}
        </Button>
        <span className='text-muted-foreground text-sm'>
          {t('Total: {{count}}', { count: total })}
        </span>
        <div className='flex-1' />
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => setSellerOpen(true)}
        >
          <Settings2 className='h-4 w-4' />
          {t('Invoice issuer settings')}
        </Button>
      </form>
      <BillsTable
        rows={(data?.items ?? []).map(toTableRow)}
        isLoading={isLoading}
        isFetching={isFetching}
        total={total}
        pagination={pagination}
        onPaginationChange={setPagination}
        paginationInFooter={false}
        exportScope='admin'
        showEnterprise
        showReconcile
        renderBillNo={(bill) => (
          <Link
            to='/finance/bills/$billId'
            params={{ billId: formatBillRef({ kind: 'bill', id: bill.id }) }}
            className='text-primary hover:underline'
          >
            {bill.bill_no}
          </Link>
        )}
        renderPeriodNo={(period) => (
          <Link
            to='/finance/bills/$billId'
            params={{
              billId: formatBillRef({ kind: 'period', id: period.id }),
            }}
            className='text-primary hover:underline'
          >
            {t('Period #{{no}}', { no: period.period_no })}
          </Link>
        )}
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
