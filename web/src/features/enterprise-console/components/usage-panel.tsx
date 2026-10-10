import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatDateStr, formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { downloadUsageCsv } from '../api'
import type { ApiResponse, UsageGroupBy, UsageSummary } from '../types'

const GROUP_OPTIONS: { value: UsageGroupBy; labelKey: string }[] = [
  { value: 'department', labelKey: 'Department' },
  { value: 'employee', labelKey: 'Employee' },
  { value: 'project', labelKey: 'Project' },
  { value: 'model', labelKey: 'Model' },
  { value: 'token', labelKey: 'API Key' },
  { value: 'day', labelKey: 'Day' },
]

type UsagePanelProps = {
  /** react-query 缓存前缀，管理员与企业侧用不同的 key */
  queryKey: readonly unknown[]
  fetchSummary: (params: {
    group_by: UsageGroupBy
    from: string
    to: string
  }) => Promise<ApiResponse<UsageSummary>>
  exportUrl: string
}

function defaultRange(): { from: Date; to: Date } {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 29)
  return { from, to }
}

/** 用量报表：日期范围 + 维度切换 + 汇总卡片 + 明细表 + CSV 导出（企业控制台与管理员共用） */
export function UsagePanel(props: UsagePanelProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [range, setRange] = useState(defaultRange)
  const [groupBy, setGroupBy] = useState<UsageGroupBy>('department')
  const [exporting, setExporting] = useState(false)
  const from = formatDateStr(range.from)
  const to = formatDateStr(range.to)
  const invalidRange = from > to

  const summary = useQuery({
    queryKey: [...props.queryKey, 'usage', groupBy, from, to],
    queryFn: async () =>
      requireServerSuccess(
        await props.fetchSummary({ group_by: groupBy, from, to })
      ).data?.items ?? [],
    enabled: !invalidRange,
  })
  const items = useMemo(() => summary.data ?? [], [summary.data])
  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          requests: acc.requests + item.request_count,
          tokens: acc.tokens + item.prompt_tokens + item.completion_tokens,
          quota: acc.quota + item.quota,
        }),
        { requests: 0, tokens: 0, quota: 0 }
      ),
    [items]
  )

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await downloadUsageCsv(props.exportUrl, { from, to })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `usage-${from}-${to}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      handleServerError(error)
    } finally {
      setExporting(false)
    }
  }

  const unassignedLabel = () => {
    if (groupBy === 'employee') return t('Shared (no employee)')
    if (groupBy === 'project') return t('No project')
    return t('Unassigned')
  }
  const columns: StaticDataTableColumn<(typeof items)[number]>[] = [
    {
      id: 'name',
      header: t(
        GROUP_OPTIONS.find((option) => option.value === groupBy)?.labelKey ??
          'Name'
      ),
      cell: (row) =>
        row.key_name ||
        (row.key_id === 0 ? unassignedLabel() : `#${row.key_id}`),
    },
    {
      id: 'requests',
      header: t('Requests'),
      cell: (row) => formatNumber(row.request_count, locale),
    },
    {
      id: 'prompt',
      header: t('Prompt Tokens'),
      cell: (row) => formatNumber(row.prompt_tokens, locale),
    },
    {
      id: 'completion',
      header: t('Completion Tokens'),
      cell: (row) => formatNumber(row.completion_tokens, locale),
    },
    {
      id: 'quota',
      header: t('Cost'),
      cell: (row) => (
        <span className='font-mono'>{formatQuotaWithCurrency(row.quota)}</span>
      ),
    },
  ]

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <DatePicker
          selected={range.from}
          onSelect={(date) => date && setRange((r) => ({ ...r, from: date }))}
          placeholder={t('From')}
        />
        <span className='text-muted-foreground'>~</span>
        <DatePicker
          selected={range.to}
          onSelect={(date) => date && setRange((r) => ({ ...r, to: date }))}
          placeholder={t('To')}
        />
        <div className='flex-1' />
        <Button
          variant='outline'
          size='sm'
          onClick={() => void handleExport()}
          disabled={exporting || invalidRange}
        >
          <Download className='h-4 w-4' />
          {exporting ? t('Exporting...') : t('Export CSV')}
        </Button>
      </div>
      {invalidRange && (
        <p className='text-destructive text-sm'>
          {t('The start date must not be later than the end date.')}
        </p>
      )}
      <div className='grid gap-4 sm:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardDescription>{t('Requests')}</CardDescription>
            <CardTitle className='font-mono'>
              {formatNumber(totals.requests, locale)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('Tokens')}</CardDescription>
            <CardTitle className='font-mono'>
              {formatNumber(totals.tokens, locale)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t('Cost')}</CardDescription>
            <CardTitle className='font-mono'>
              {formatQuotaWithCurrency(totals.quota)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Tabs
        value={groupBy}
        onValueChange={(value) => setGroupBy(value as UsageGroupBy)}
      >
        <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
          {GROUP_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {t(option.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <StaticDataTable
        columns={columns}
        data={items}
        getRowKey={(row) => `${row.key_id}-${row.key_name}`}
        empty={!summary.isLoading && items.length === 0}
        emptyContent={t('No usage in this range')}
      />
    </div>
  )
}
