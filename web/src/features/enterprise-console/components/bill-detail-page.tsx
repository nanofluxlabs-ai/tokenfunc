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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { BillSnapshotSection } from '@/features/finance/components/usage-breakdown/bill-snapshot-section'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber, formatTimestampToDate } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getBill } from '../api'
import { isBillSnapshotV2, type Bill, type UsageSnapshotGroup } from '../types'
import {
  BillExportCsvButton,
  BillStatusBadge,
  InvoiceButton,
} from './bills-table'
import { EnterpriseGuard } from './enterprise-guard'

const route = getRouteApi('/_authenticated/enterprise/bills/$id')

const NUM = 'text-right tabular-nums'

/** 归因块（按模型 v1 / 按团队 / 按成员）：缓存两列旧快照没有，显示「-」 */
function SnapshotTable(props: {
  title: string
  items: UsageSnapshotGroup[]
  fallbackName: string
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const number = (value: number | undefined) =>
    value == null ? '-' : formatNumber(value, locale)
  const columns: StaticDataTableColumn<UsageSnapshotGroup>[] = [
    {
      id: 'name',
      header: props.title,
      cell: (row) => row.key_name || props.fallbackName,
    },
    {
      id: 'requests',
      header: t('Requests'),
      className: NUM,
      cellClassName: NUM,
      cell: (row) => number(row.request_count),
    },
    {
      id: 'input',
      header: t('Input tokens'),
      className: NUM,
      cellClassName: NUM,
      cell: (row) => number(row.prompt_tokens),
    },
    {
      id: 'cached',
      header: t('Cache hits'),
      className: NUM,
      cellClassName: NUM,
      cell: (row) => number(row.cache_tokens),
    },
    {
      id: 'cache_write',
      header: t('Cache writes'),
      className: NUM,
      cellClassName: NUM,
      cell: (row) => number(row.cache_creation_tokens),
    },
    {
      id: 'output',
      header: t('Output tokens'),
      className: NUM,
      cellClassName: NUM,
      cell: (row) => number(row.completion_tokens),
    },
    {
      id: 'amount',
      header: t('Amount'),
      className: NUM,
      cellClassName: `${NUM} font-mono`,
      cell: (row) => formatQuotaWithCurrency(row.quota),
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

/** 账单详情正文；导出供测试复用 */
export function BillDetailContent(props: { bill: Bill }) {
  const { t } = useTranslation()
  const bill = props.bill
  const snapshot = bill.usage_snapshot ?? {}
  const isStatement = bill.bill_type === 'statement'
  const outstanding = (
    Number.parseFloat(bill.total_usd) - Number.parseFloat(bill.paid_usd)
  ).toFixed(2)

  let usageBlocks: React.ReactNode
  if (isBillSnapshotV2(snapshot)) {
    usageBlocks = (
      <BillSnapshotSection
        snapshot={snapshot}
        amountQuota={bill.amount_quota}
      />
    )
  } else {
    usageBlocks = (
      <>
        <Alert>
          <AlertDescription>
            {t(
              'This bill was issued before unit prices were snapshotted; price and daily breakdowns are not available.'
            )}
          </AlertDescription>
        </Alert>
        <SnapshotTable
          title={t('Model')}
          items={snapshot.by_model ?? []}
          fallbackName='—'
        />
      </>
    )
  }

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
          <CardContent className='flex flex-wrap gap-2'>
            <InvoiceButton bill={bill} size='sm' />
            <BillExportCsvButton bill={bill} scope='enterprise' size='sm' />
          </CardContent>
        </Card>
      </div>
      {isStatement && (
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
      )}
      {usageBlocks}
      <SnapshotTable
        title={t('Team')}
        items={snapshot.by_team ?? snapshot.by_department ?? []}
        fallbackName={t('Unassigned')}
      />
      <SnapshotTable
        title={t('Member')}
        items={snapshot.by_member ?? snapshot.by_employee ?? []}
        fallbackName={t('Team key (no holder)')}
      />
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
