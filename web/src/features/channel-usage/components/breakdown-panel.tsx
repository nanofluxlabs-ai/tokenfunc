import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { DayRange } from '@/features/finance/lib/date-presets'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import { BREAKDOWN_TOP_N } from '../constants'
import {
  useFilteredBreakdown,
  type BreakdownEntry,
} from '../hooks/use-channel-breakdowns'
import { formatBillingDate } from '../lib/billing-day'
import { metricValue } from '../lib/usage-metrics'
import type {
  BreakdownSelection,
  ChannelBreakdownDimension,
  ChannelBreakdownModel,
  ChannelBreakdownPayer,
  ChannelUsageItem,
  ChannelUsageMetric,
} from '../types'
import {
  AmountCell,
  OthersFooter,
  PayerBalanceCell,
  PayerNameCell,
  RankBadge,
  UsageTooltip,
} from './breakdown-cells'

function CardShell(props: {
  title: string
  extra?: ReactNode
  loading?: boolean
  children: ReactNode
}) {
  return (
    <Card className='gap-0 py-0'>
      <CardHeader className='flex min-h-10 flex-row flex-wrap items-center justify-between gap-2 border-b px-3 py-2'>
        <CardTitle className='text-sm'>{props.title}</CardTitle>
        {props.extra}
      </CardHeader>
      <CardContent
        className={cn(
          'relative px-3 py-1',
          props.loading && 'opacity-60 transition-opacity'
        )}
        aria-busy={props.loading}
      >
        {props.loading && (
          <Spinner
            className='absolute top-2 right-2'
            data-slot='card-spinner'
          />
        )}
        {props.children}
      </CardContent>
    </Card>
  )
}

function FilterChip(props: { label: string; onClear: () => void }) {
  const { t } = useTranslation()
  return (
    <Button
      variant='outline'
      size='xs'
      onClick={(event) => {
        event.stopPropagation()
        props.onClear()
      }}
      aria-label={t('Clear filter')}
    >
      {t('Only {{name}}', { name: props.label })}
      <X data-icon='inline-end' />
    </Button>
  )
}

function EmptyRows() {
  const { t } = useTranslation()
  return (
    <p className='text-muted-foreground py-4 text-center text-xs'>
      {t('No data')}
    </p>
  )
}

const ROW_CLASS =
  'grid items-center gap-3 rounded-md border-t border-dashed px-1.5 py-2 first:border-t-0'

function UsersCard(props: {
  dim: ChannelBreakdownDimension<ChannelBreakdownPayer> | null
  metric: ChannelUsageMetric
  range: DayRange
  selection: BreakdownSelection | null
  onSelect: (selection: BreakdownSelection | null) => void
  loading: boolean
}) {
  const { t } = useTranslation()
  const dim = props.dim
  const total = metricValue(dim?.total, props.metric)
  const filteredByModel = props.selection?.type === 'model'
  return (
    <CardShell
      title={t('Top {{n}} payers', { n: BREAKDOWN_TOP_N })}
      loading={props.loading}
      extra={
        filteredByModel && props.selection ? (
          <FilterChip
            label={props.selection.label}
            onClear={() => props.onSelect(null)}
          />
        ) : undefined
      }
    >
      {!dim || dim.items.length === 0 ? (
        <EmptyRows />
      ) : (
        <>
          {dim.items.map((payer, index) => {
            const selected =
              props.selection?.type === 'payer' &&
              props.selection.key === payer.payer_id
            // 系统请求（payer_id=0）没有可反查的付款主体
            const clickable = !filteredByModel && payer.payer_id > 0
            return (
              <div
                key={payer.payer_id}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-pressed={clickable ? selected : undefined}
                className={cn(
                  ROW_CLASS,
                  'grid-cols-[auto_minmax(0,1fr)] @[560px]:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)]',
                  clickable && 'hover:bg-muted/60 cursor-pointer',
                  selected && 'bg-primary/10'
                )}
                onClick={
                  clickable
                    ? () =>
                        props.onSelect(
                          selected
                            ? null
                            : {
                                type: 'payer',
                                key: payer.payer_id,
                                label:
                                  (payer.is_enterprise &&
                                    payer.enterprise_name) ||
                                  payer.username,
                              }
                        )
                    : undefined
                }
                onKeyDown={
                  clickable
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          event.currentTarget.click()
                        }
                      }
                    : undefined
                }
              >
                <RankBadge rank={index + 1} />
                <div className='flex min-w-0 flex-col gap-1'>
                  <PayerNameCell payer={payer} range={props.range} />
                  <div className='flex flex-col gap-1 @[560px]:hidden'>
                    <UsageTooltip amount={payer}>
                      <AmountCell
                        amount={payer}
                        metric={props.metric}
                        total={total}
                      />
                    </UsageTooltip>
                    <PayerBalanceCell payer={payer} />
                  </div>
                </div>
                <div className='hidden @[560px]:block'>
                  <UsageTooltip amount={payer}>
                    <AmountCell
                      amount={payer}
                      metric={props.metric}
                      total={total}
                    />
                  </UsageTooltip>
                </div>
                <div className='hidden justify-end @[560px]:flex'>
                  <PayerBalanceCell payer={payer} />
                </div>
              </div>
            )
          })}
          <OthersFooter
            count={dim.others_count}
            amount={dim.others}
            total={dim.total}
            metric={props.metric}
            text={(count, amount, share) =>
              t('Other {{count}} payers total {{amount}} ({{share}})', {
                count,
                amount,
                share,
              })
            }
          />
        </>
      )}
    </CardShell>
  )
}

function ModelsCard(props: {
  dim: ChannelBreakdownDimension<ChannelBreakdownModel> | null
  metric: ChannelUsageMetric
  selection: BreakdownSelection | null
  onSelect: (selection: BreakdownSelection | null) => void
  loading: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const dim = props.dim
  const total = metricValue(dim?.total, props.metric)
  const filteredByPayer = props.selection?.type === 'payer'
  return (
    <CardShell
      title={t('Top {{n}} models', { n: BREAKDOWN_TOP_N })}
      loading={props.loading}
      extra={
        filteredByPayer && props.selection ? (
          <FilterChip
            label={props.selection.label}
            onClear={() => props.onSelect(null)}
          />
        ) : (
          <span className='text-muted-foreground text-xs'>
            {t('Click a row to cross-filter the other side')}
          </span>
        )
      }
    >
      {!dim || dim.items.length === 0 ? (
        <EmptyRows />
      ) : (
        <>
          {dim.items.map((model, index) => {
            const selected =
              props.selection?.type === 'model' &&
              props.selection.key === model.model_name
            const clickable = !filteredByPayer
            return (
              <div
                key={model.model_name || `empty-${index}`}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-pressed={clickable ? selected : undefined}
                className={cn(
                  ROW_CLASS,
                  'grid-cols-[auto_minmax(0,1fr)] @[400px]:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)]',
                  clickable && 'hover:bg-muted/60 cursor-pointer',
                  selected && 'bg-primary/10'
                )}
                onClick={
                  clickable
                    ? () =>
                        props.onSelect(
                          selected
                            ? null
                            : {
                                type: 'model',
                                key: model.model_name,
                                label: model.model_name,
                              }
                        )
                    : undefined
                }
                onKeyDown={
                  clickable
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          event.currentTarget.click()
                        }
                      }
                    : undefined
                }
              >
                <RankBadge rank={index + 1} />
                <div className='flex min-w-0 flex-col'>
                  <span className='truncate font-medium'>
                    {model.model_name || '-'}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {t('{{count}} calls', {
                      count: formatNumber(model.call_count || 0, locale),
                    })}{' '}
                    · {t('Input')}{' '}
                    {formatCompactNumber(model.prompt_tokens || 0, locale)} /{' '}
                    {t('Output')}{' '}
                    {formatCompactNumber(model.completion_tokens || 0, locale)}
                  </span>
                  <div className='mt-1 @[400px]:hidden'>
                    <AmountCell
                      amount={model}
                      metric={props.metric}
                      total={total}
                    />
                  </div>
                </div>
                <div className='hidden @[400px]:block'>
                  <AmountCell
                    amount={model}
                    metric={props.metric}
                    total={total}
                  />
                </div>
              </div>
            )
          })}
          <OthersFooter
            count={dim.others_count}
            amount={dim.others}
            total={dim.total}
            metric={props.metric}
            text={(count, amount, share) =>
              t('Other {{count}} models total {{amount}} ({{share}})', {
                count,
                amount,
                share,
              })
            }
          />
        </>
      )}
    </CardShell>
  )
}

/** 覆盖提示：明细表上线前（或补数前）的时段没有明细，合计会低于渠道行的区间价值 */
function CoverageNotice(props: {
  channel: ChannelUsageItem
  covered: number
  coverageStartTs: number
}) {
  const { t } = useTranslation()
  const rowTotal = props.channel.range_official_quota || 0
  if (!props.coverageStartTs) {
    return (
      <p className='text-warning text-xs'>
        {t(
          'No breakdown data yet: breakdown statistics start after the feature goes live'
        )}
      </p>
    )
  }
  // 容差 1%：热路径与小时桶同一 flush 周期落库，正常情况下两者相等
  if (!(rowTotal > 0 && props.covered < rowTotal * 0.99)) return null
  return (
    <p className='text-warning text-xs'>
      {t(
        'Breakdown covers {{covered}} of the range value {{total}}: breakdown statistics start from {{date}}, earlier usage is not included',
        {
          covered: formatQuota(props.covered),
          total: formatQuota(rowTotal),
          date: formatBillingDate(props.coverageStartTs),
        }
      )}
    </p>
  )
}

type ChannelBreakdownPanelProps = {
  channel: ChannelUsageItem
  entry: BreakdownEntry | undefined
  range: DayRange
  rangeLabel: string
  metric: ChannelUsageMetric
  coverageStartTs: number
  onRetry: () => void
}

/**
 * 渠道消耗页展开行：所选区间内该渠道的付款主体 Top 5 与模型 Top 5。
 * 两卡可交叉筛选：选中一个付款主体 → 模型卡只看该主体；选中一个模型 → 用户卡只看该模型。
 * 未筛选的数据来自父组件（支持「全部展开」一次批量请求）；筛选态由本组件单独请求。
 */
export function ChannelBreakdownPanel(props: ChannelBreakdownPanelProps) {
  const { t } = useTranslation()
  const [selection, setSelection] = useState<BreakdownSelection | null>(null)

  // 区间 / 口径变化后筛选失效
  useEffect(() => {
    setSelection(null)
  }, [props.range.start, props.range.end, props.metric])

  const filtered = useFilteredBreakdown({
    channelId: props.channel.id,
    range: props.range,
    metric: props.metric,
    payerId: selection?.type === 'payer' ? selection.key : undefined,
    modelName: selection?.type === 'model' ? selection.key : undefined,
  })

  const data = props.entry?.data ?? null
  if (!props.entry || (props.entry.loading && !data)) {
    return (
      <div className='flex justify-center py-6' aria-busy='true'>
        <Spinner />
      </div>
    )
  }
  if (props.entry.error && !data) {
    return (
      <div className='flex items-center justify-center gap-2 py-4 text-sm'>
        <span className='text-destructive'>
          {t('Failed to load breakdown')}
        </span>
        <Button variant='ghost' size='sm' onClick={props.onRetry}>
          {t('Retry')}
        </Button>
      </div>
    )
  }

  const usersDim =
    selection?.type === 'model'
      ? (filtered.data?.users ?? null)
      : (data?.users ?? null)
  const modelsDim =
    selection?.type === 'payer'
      ? (filtered.data?.models ?? null)
      : (data?.models ?? null)
  const total = data?.users.total

  return (
    <div
      className='@container flex flex-col gap-2'
      onClick={(event) => event.stopPropagation()}
    >
      <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs'>
        <span>
          {t('{{range}} (billing time zone)', { range: props.rangeLabel })} ·{' '}
          {t('Breakdown total')}{' '}
          <b className='text-foreground'>
            {formatQuota(total?.official_quota || 0)}
          </b>{' '}
          · {t('Actual charge')} {formatQuota(total?.quota || 0)}
        </span>
        <span>
          {t('{{users}} payers · {{models}} models', {
            users: data?.users.count || 0,
            models: data?.models.count || 0,
          })}
        </span>
      </div>
      <CoverageNotice
        channel={props.channel}
        covered={total?.official_quota || 0}
        coverageStartTs={props.coverageStartTs}
      />
      <div className='grid items-start gap-3 @[960px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
        <UsersCard
          dim={usersDim}
          metric={props.metric}
          range={props.range}
          selection={selection}
          onSelect={setSelection}
          loading={selection?.type === 'model' && filtered.isFetching}
        />
        <ModelsCard
          dim={modelsDim}
          metric={props.metric}
          selection={selection}
          onSelect={setSelection}
          loading={selection?.type === 'payer' && filtered.isFetching}
        />
      </div>
    </div>
  )
}
