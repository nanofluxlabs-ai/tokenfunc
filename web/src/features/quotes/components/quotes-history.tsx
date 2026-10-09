import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/use-debounce'
import { formatTimestampToDate } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listQuotes } from '../api'
import { openQuotePrintWindow } from '../lib/quote-html'
import type { Quote } from '../types'

const PAGE_SIZE = 20

/** 历史报价单：可再次打印，不可编辑（一次性生成） */
export function QuotesHistory() {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const debounced = useDebounce(keyword, 400)
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['admin-quotes', debounced, page],
    queryFn: async () =>
      requireServerSuccess(
        await listQuotes({
          keyword: debounced || undefined,
          p: page,
          page_size: PAGE_SIZE,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const columns: StaticDataTableColumn<Quote>[] = [
    {
      id: 'no',
      header: t('Quote No.'),
      cell: (row) => <span className='font-mono'>{row.quote_no}</span>,
    },
    { id: 'customer', header: t('Customer'), cell: (row) => row.customer_name },
    {
      id: 'models',
      header: t('Models'),
      cell: (row) => row.items?.length ?? 0,
    },
    {
      id: 'discount',
      header: t('Discount'),
      cell: (row) => (row.discount_percent ? `${row.discount_percent}%` : '—'),
    },
    {
      id: 'valid',
      header: t('Valid until'),
      cell: (row) =>
        row.valid_until ? formatTimestampToDate(row.valid_until) : '—',
    },
    {
      id: 'created',
      header: t('Created'),
      cell: (row) => formatTimestampToDate(row.created_at),
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (row) => (
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={t('Print / Save PDF')}
          onClick={() => {
            if (!openQuotePrintWindow(row, t)) {
              toast.error(t('Please allow pop-ups to print the quotation.'))
            }
          }}
        >
          <Printer />
        </Button>
      ),
    },
  ]
  return (
    <div className='flex flex-col gap-3'>
      <Input
        className='max-w-xs'
        placeholder={t('Search by customer or quote No....')}
        aria-label={t('Search quotes')}
        value={keyword}
        onChange={(event) => {
          setKeyword(event.target.value)
          setPage(1)
        }}
      />
      <StaticDataTable
        columns={columns}
        data={data?.items ?? []}
        getRowKey={(row) => row.id}
        empty={!isLoading && (data?.items.length ?? 0) === 0}
        emptyContent={t('No quotes yet')}
      />
      <div className='text-muted-foreground flex items-center justify-end gap-2 text-sm'>
        <span>{t('Total: {{count}}', { count: total })}</span>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          {t('Previous')}
        </Button>
        <span>
          {page} / {pageCount}
        </span>
        <Button
          variant='outline'
          size='sm'
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  )
}
