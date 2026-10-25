import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getBill } from '../api'
import type { Bill, UsageSnapshotGroup } from '../types'
import { BillStatusBadge, InvoiceButton } from './bills-table'
import { EnterpriseGuard } from './enterprise-guard'

const route = getRouteApi('/_authenticated/enterprise/bills/$id')

function SnapshotTable(props: {
  title: string
  items: UsageSnapshotGroup[]
  fallbackName: string
}) {
  const { t } = useTranslation()
  const columns: StaticDataTableColumn<UsageSnapshotGroup>[] = [
    {
      id: 'name',
      header: props.title,
      cell: (row) => row.key_name || props.fallbackName,
    },
    { id: 'requests', header: t('Requests'), cell: (row) => row.request_count },
    {
      id: 'tokens',
      header: t('Tokens'),
      cell: (row) => row.prompt_tokens + row.completion_tokens,
    },
    {
      id: 'amount',
      header: t('Amount'),
      cell: (row) => (
        <span className='font-mono'>{formatQuotaWithCurrency(row.quota)}</span>
      ),
    },
  ]
  return (
    <StaticDataTable
      columns={columns}
      data={props.items}
      getRowKey={(row, index) => `${row.key_id}-${index}`}
      empty={props.items.length === 0}
      emptyContent={t('No usage')}
    />
  )
}

function BillDetailContent(props: { bill: Bill }) {
  const { t } = useTranslation()
  const bill = props.bill
  const snapshot = (bill.usage_snapshot ?? {}) as Record<string, unknown>
  const isStatement = bill.bill_type === 'statement'
  const outstanding = (
    Number.parseFloat(bill.total_usd) - Number.parseFloat(bill.paid_usd)
  ).toFixed(2)
  return (
    <div className='flex flex-col gap-6'>
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardDescription>
              {isStatement ? t('Consumption') : t('Total due')}
            </CardDescription>
            <CardTitle className='font-mono'>
              {bill.currency} {Number.parseFloat(bill.total_usd).toFixed(2)}
            </CardTitle>
          </CardHeader>
          {!isStatement && (
            <CardContent className='text-muted-foreground text-sm'>
              {t('Paid')}: {Number.parseFloat(bill.paid_usd).toFixed(2)} ·{' '}
              {t('Outstanding')}: {outstanding}
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('Period')}</CardDescription>
            <CardTitle className='text-base'>
              {formatTimestampToDate(bill.period_start)} ~{' '}
              {formatTimestampToDate(bill.period_end)}
            </CardTitle>
          </CardHeader>
          <CardContent className='text-muted-foreground text-sm'>
            {t('Issued')}: {formatTimestampToDate(bill.issued_at)}
            {!isStatement &&
              ` · ${t('Due')}: ${formatTimestampToDate(bill.due_at)}`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('Status')}</CardDescription>
            <CardTitle>
              {isStatement ? (
                t('Monthly statement')
              ) : (
                <BillStatusBadge bill={bill} />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceButton bill={bill} size='sm' />
          </CardContent>
        </Card>
      </div>
      {isStatement ? (
        <Card>
          <CardContent className='grid gap-2 text-sm sm:grid-cols-5'>
            {(
              [
                'opening_quota',
                'topup_quota',
                'consumption_quota',
                'adjustment_quota',
                'closing_quota',
              ] as const
            ).map((key) => (
              <div key={key}>
                <div className='text-muted-foreground'>
                  {
                    {
                      opening_quota: t('Opening balance'),
                      topup_quota: t('Top-ups'),
                      consumption_quota: t('Consumption'),
                      adjustment_quota: t('Adjustments'),
                      closing_quota: t('Closing balance'),
                    }[key]
                  }
                </div>
                <div className='font-mono'>
                  {formatQuotaWithCurrency(Number(snapshot[key] ?? 0))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <>
          <SnapshotTable
            title={t('Model')}
            items={
              (snapshot.by_model as UsageSnapshotGroup[] | undefined) ?? []
            }
            fallbackName='—'
          />
          <SnapshotTable
            title={t('Team')}
            items={
              ((snapshot.by_team ?? snapshot.by_department) as
                | UsageSnapshotGroup[]
                | undefined) ?? []
            }
            fallbackName={t('Unassigned')}
          />
          <SnapshotTable
            title={t('Member')}
            items={
              ((snapshot.by_member ?? snapshot.by_employee) as
                | UsageSnapshotGroup[]
                | undefined) ?? []
            }
            fallbackName={t('Team key (no holder)')}
          />
        </>
      )}
    </div>
  )
}

export function EnterpriseBillDetail() {
  const { t } = useTranslation()
  const { id } = route.useParams()
  const billId = Number(id)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['enterprise', 'bills', billId],
    queryFn: async () =>
      requireServerSuccess(await getBill(billId)).data ?? null,
    enabled: Number.isFinite(billId) && billId > 0,
    meta: { errorToast: false },
  })
  let content = <LoadingState />
  if (!isLoading && (isError || !data)) {
    content = <EmptyState title={t('Bill not found')} />
  } else if (data) {
    content = <BillDetailContent bill={data} />
  }
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {data ? data.bill_no : t('Bill')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          render={<Link to='/enterprise/bills' />}
        >
          {t('Back to bills')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <EnterpriseGuard>{content}</EnterpriseGuard>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
