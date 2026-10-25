import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listBills } from '../api'
import { BillsTable } from './bills-table'
import { EnterpriseGuard } from './enterprise-guard'

const PAGE_SIZE = 20

/** 账单列表：授信账单与月度对账单同一张表，类型作一列（不再分 tab） */
function BillsContent() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['enterprise', 'bills', 'list', page],
    queryFn: async () =>
      requireServerSuccess(await listBills({ p: page, page_size: PAGE_SIZE }))
        .data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return (
    <div className='flex flex-col gap-4'>
      <BillsTable
        bills={data?.items ?? []}
        isLoading={isLoading}
        exportScope='enterprise'
        renderBillNo={(bill) => (
          <Link
            to='/enterprise/bills/$id'
            params={{ id: String(bill.id) }}
            className='hover:underline'
          >
            {bill.bill_no}
          </Link>
        )}
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

export function EnterpriseBills() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Bills')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <EnterpriseGuard>
          <BillsContent />
        </EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
