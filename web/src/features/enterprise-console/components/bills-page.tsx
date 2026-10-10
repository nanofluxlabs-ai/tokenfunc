import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listBills } from '../api'
import { BillsTable } from './bills-table'
import { EnterpriseGuard } from './enterprise-guard'

const PAGE_SIZE = 20

function BillsContent() {
  const { t } = useTranslation()
  const [billType, setBillType] = useState<'all' | 'credit' | 'statement'>(
    'all'
  )
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['enterprise', 'bills', billType, page],
    queryFn: async () =>
      requireServerSuccess(
        await listBills({
          bill_type: billType === 'all' ? undefined : billType,
          p: page,
          page_size: PAGE_SIZE,
        })
      ).data ?? {
        items: [],
        total: 0,
      },
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return (
    <div className='flex flex-col gap-4'>
      <Tabs
        value={billType}
        onValueChange={(value) => {
          setBillType(value as typeof billType)
          setPage(1)
        }}
      >
        <TabsList>
          <TabsTrigger value='all'>{t('All')}</TabsTrigger>
          <TabsTrigger value='credit'>{t('Credit bill')}</TabsTrigger>
          <TabsTrigger value='statement'>{t('Monthly statement')}</TabsTrigger>
        </TabsList>
      </Tabs>
      <BillsTable
        bills={data?.items ?? []}
        isLoading={isLoading}
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
