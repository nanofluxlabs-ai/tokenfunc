import { forwardRef, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'

import {
  readUsagePalette,
  USAGE_OTHERS_COLOR,
} from '../lib/usage-chart-palette'
import { buildUsageColumns } from '../lib/usage-columns'
import type { UsageDayItem, UsageGroupBy, UsageSummaryItem } from '../types'
import { UsageDonutChart, UsageRankChart } from './usage-charts'
import { type UsageMetric, UsageMetricTabs, UsageTrend } from './usage-trend'

/** 归属维度：团队 / 成员 / API 密钥 */
export type UsageAttributionGroup = Extract<
  UsageGroupBy,
  'team' | 'member' | 'token'
>

type SectionProps = {
  idPrefix: string
  loading: boolean
  totalQuota: number
}

/** 按日：趋势图 + 明细表（倒序，表格区域内滚动），两者同源 */
export const UsageDailySection = forwardRef<
  HTMLDivElement,
  SectionProps & { days: UsageDayItem[] }
>(function UsageDailySection(props, ref) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [metric, setMetric] = useState<UsageMetric>('quota')
  const rows = useMemo(() => [...props.days].reverse(), [props.days])
  const columns = buildUsageColumns<UsageDayItem>({
    t,
    locale,
    nameHeader: t('Date'),
    nameCell: (row) => <span className='tabular-nums'>{row.day}</span>,
    totalQuota: props.totalQuota,
    cache: 'none',
  })
  return (
    <Card ref={ref} role='region' aria-label={t('By day')}>
      <CardHeader>
        <CardTitle>{t('By day')}</CardTitle>
        <CardDescription>
          {t('Daily cost, tokens and requests')}
        </CardDescription>
        <CardAction>
          <UsageMetricTabs value={metric} onChange={setMetric} />
        </CardAction>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <UsageTrend
          id={`${props.idPrefix}-daily`}
          days={props.days}
          metric={metric}
          loading={props.loading}
        />
        <div className='max-h-96 overflow-y-auto'>
          <StaticDataTable
            columns={columns}
            data={rows}
            getRowKey={(row) => row.day}
            empty={!props.loading && rows.length === 0}
            emptyContent={t('No usage in this range')}
          />
        </div>
      </CardContent>
    </Card>
  )
})

/** 按模型：环形占比 + 明细表，两者同源 */
export const UsageModelSection = forwardRef<
  HTMLDivElement,
  SectionProps & { items: UsageSummaryItem[] }
>(function UsageModelSection(props, ref) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const slices = useMemo(
    () =>
      props.items.map((item) => ({ name: item.key_name, quota: item.quota })),
    [props.items]
  )
  // 与环形图同一份调色板，按行序（消耗倒序）对应切片
  const palette = readUsagePalette()
  const columns = buildUsageColumns<UsageSummaryItem>({
    t,
    locale,
    nameHeader: t('Model'),
    nameCell: (row, index) => (
      <span className='flex items-center gap-2'>
        <span
          className='size-2 shrink-0 rounded-full'
          style={{ backgroundColor: palette[index] ?? USAGE_OTHERS_COLOR }}
          aria-hidden='true'
        />
        <span className='font-mono text-xs'>{row.key_name || '-'}</span>
      </span>
    ),
    totalQuota: props.totalQuota,
    cache: 'hit-write',
  })
  return (
    <Card ref={ref} role='region' aria-label={t('By model')}>
      <CardHeader>
        <CardTitle>{t('By model')}</CardTitle>
        <CardDescription>
          {t('Cost share and token usage per model')}
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4 @4xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]'>
        <UsageDonutChart id={`${props.idPrefix}-model-donut`} data={slices} />
        <div className='min-w-0'>
          <StaticDataTable
            columns={columns}
            data={props.items}
            getRowKey={(row) => row.key_name}
            empty={!props.loading && props.items.length === 0}
            emptyContent={t('No usage in this range')}
          />
        </div>
      </CardContent>
    </Card>
  )
})

const ATTRIBUTION_OPTIONS: {
  value: UsageAttributionGroup
  labelKey: string
}[] = [
  { value: 'team', labelKey: 'Team' },
  { value: 'member', labelKey: 'Member' },
  { value: 'token', labelKey: 'API Key' },
]

/** 按归属：团队 / 成员 / 密钥页签，排行条形图 + 明细表，两者同源 */
export const UsageAttributionSection = forwardRef<
  HTMLDivElement,
  SectionProps & {
    items: UsageSummaryItem[]
    group: UsageAttributionGroup
    onGroupChange: (group: UsageAttributionGroup) => void
    hideTeamDimension?: boolean
  }
>(function UsageAttributionSection(props, ref) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const options = props.hideTeamDimension
    ? ATTRIBUTION_OPTIONS.filter((option) => option.value !== 'team')
    : ATTRIBUTION_OPTIONS
  const nameOf = (row: UsageSummaryItem) => {
    if (row.key_name) return row.key_name
    if (row.key_id !== 0) return `#${row.key_id}`
    return props.group === 'member'
      ? t('Team key (no holder)')
      : t('Unassigned')
  }
  const slices = props.items.map((item) => ({
    name: nameOf(item),
    quota: item.quota,
  }))
  const header =
    ATTRIBUTION_OPTIONS.find((option) => option.value === props.group)
      ?.labelKey ?? 'Name'
  const columns = buildUsageColumns<UsageSummaryItem>({
    t,
    locale,
    nameHeader: t(header),
    nameCell: nameOf,
    totalQuota: props.totalQuota,
    cache: 'hit-write',
  })
  return (
    <Card ref={ref} role='region' aria-label={t('By attribution')}>
      <CardHeader>
        <CardTitle>{t('By attribution')}</CardTitle>
        <CardDescription>
          {t('Who spent it: team, member or key')}
        </CardDescription>
        <CardAction>
          <Tabs
            value={props.group}
            onValueChange={(value) =>
              props.onGroupChange(value as UsageAttributionGroup)
            }
          >
            <TabsList aria-label={t('Attribution dimension')}>
              {options.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <UsageRankChart
          id={`${props.idPrefix}-rank-${props.group}`}
          data={slices}
        />
        <StaticDataTable
          columns={columns}
          data={props.items}
          getRowKey={(row) => `${row.key_id}-${row.key_name}`}
          empty={!props.loading && props.items.length === 0}
          emptyContent={t('No usage in this range')}
        />
      </CardContent>
    </Card>
  )
})
