import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useMediaQuery } from '@/hooks/use-media-query'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  buildUsageGroups,
  describeRatio,
  formatRatioValue,
  formatUnitPrice,
  hasCacheWrite1h,
} from '../../lib/usage-breakdown'
import type { FinanceRatioValue, UsageGroupModelRow } from '../../types'
import { MetricTooltip } from '../metric-tooltip'
import { ShareBar } from '../share-bar'

type TokenGroupSummaryTableProps = {
  rows: UsageGroupModelRow[]
  totalQuota: number
  isLoading?: boolean
}

const NUM = 'text-right tabular-nums whitespace-nowrap'

function RatioCell(props: {
  ratio: FinanceRatioValue | null
  totalQuota: number
  label: string
  exclusive?: boolean
  perCallPrice?: FinanceRatioValue | null
}) {
  const { t } = useTranslation()
  if (props.perCallPrice) {
    return (
      <span className='text-xs'>
        {t('Per call')} ${formatRatioValue(props.perCallPrice.value)}
      </span>
    )
  }
  const described = describeRatio(props.ratio, props.totalQuota)
  if (!described) return <span className='text-muted-foreground'>-</span>
  const label = props.exclusive ? t('Exclusive ratio') : props.label
  const body = (
    <span className='inline-flex items-center gap-1 text-xs'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='font-mono'>{described.text}</span>
      {described.shares.length > 1 && (
        <TriangleAlert
          className='text-warning h-3.5 w-3.5'
          aria-hidden='true'
        />
      )}
    </span>
  )
  if (described.shares.length <= 1) return body
  return (
    <MetricTooltip
      note={t('Multiple ratio values in this period')}
      items={described.shares.map((share) => ({
        label: formatRatioValue(share.value),
        value: `${share.percent.toFixed(1)}%`,
      }))}
    >
      {body}
    </MetricTooltip>
  )
}

/** 按令牌分组汇总：分组行可展开，模型行列出 token 用量、单价、金额、占比与倍率 */
export function TokenGroupSummaryTable(props: TokenGroupSummaryTableProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const groups = useMemo(
    () => buildUsageGroups(props.rows, props.totalQuota, t('Ungrouped')),
    [props.rows, props.totalQuota, t]
  )
  const split1h = useMemo(() => hasCacheWrite1h(props.rows), [props.rows])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // 手机上只留 分组/模型 / 金额 / 占比；调用次数、token、单价、倍率在桌面或导出里看
  const compact = useMediaQuery('(max-width: 640px)')
  const number = (value: number) => formatNumber(value, locale)

  const tokenHeaders = [
    t('Input tokens'),
    t('Cache hits'),
    split1h ? t('Cache writes (5m)') : t('Cache writes'),
    ...(split1h ? [t('Cache writes (1h)')] : []),
    t('Output tokens'),
  ]
  const priceHeaders = [
    t('Input price'),
    t('Cache hit price'),
    split1h ? t('Cache write (5m) price') : t('Cache write price'),
    ...(split1h ? [t('Cache write (1h) price')] : []),
    t('Output price'),
  ]
  const spanColumns = tokenHeaders.length + priceHeaders.length
  const totalColumns = compact ? 3 : 2 + spanColumns + 3

  return (
    <StaticDataTable tableClassName={compact ? undefined : 'min-w-[1200px]'}>
      <TableHeader>
        <TableRow>
          <TableHead className='sm:min-w-[200px]'>{`${t('Token group')} / ${t('Model')}`}</TableHead>
          {!compact && (
            <>
              <TableHead className={NUM}>{t('Requests')}</TableHead>
              {tokenHeaders.map((header) => (
                <TableHead key={header} className={NUM}>
                  {header}
                </TableHead>
              ))}
              {priceHeaders.map((header) => (
                <TableHead key={header} className={NUM}>
                  <div className='flex flex-col items-end leading-tight'>
                    <span>{header}</span>
                    <span className='text-muted-foreground text-[10px] font-normal'>
                      USD/1M
                    </span>
                  </div>
                </TableHead>
              ))}
            </>
          )}
          <TableHead className={NUM}>{t('Amount (USD)')}</TableHead>
          <TableHead className={NUM}>{t('Share')}</TableHead>
          {!compact && <TableHead>{t('Ratio')}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={totalColumns}
              className='text-muted-foreground h-20 text-center'
            >
              {props.isLoading ? t('Loading...') : t('No usage')}
            </TableCell>
          </TableRow>
        )}
        {groups.map((group) => {
          const isOpen = expanded[group.group] ?? false
          return (
            <Fragment key={group.group || '__ungrouped'}>
              <TableRow
                className='bg-muted/30 cursor-pointer'
                onClick={() =>
                  setExpanded((previous) => ({
                    ...previous,
                    [group.group]: !isOpen,
                  }))
                }
              >
                <TableCell className='font-semibold'>
                  <span className='inline-flex items-center gap-1'>
                    <Button
                      variant='ghost'
                      size='icon-xs'
                      aria-label={isOpen ? t('Collapse') : t('Expand')}
                      aria-expanded={isOpen}
                      onClick={(event) => {
                        event.stopPropagation()
                        setExpanded((previous) => ({
                          ...previous,
                          [group.group]: !isOpen,
                        }))
                      }}
                    >
                      {isOpen ? <ChevronDown /> : <ChevronRight />}
                    </Button>
                    {group.label}
                  </span>
                </TableCell>
                {!compact && (
                  <>
                    <TableCell className={cn(NUM, 'font-semibold')}>
                      {number(group.count)}
                    </TableCell>
                    <TableCell
                      colSpan={spanColumns}
                      className='text-muted-foreground text-xs'
                    >
                      {t('{{count}} models · total ${{amount}}', {
                        count: group.modelCount,
                        amount: group.amountUsd.toFixed(4),
                      })}
                    </TableCell>
                  </>
                )}
                <TableCell className={cn(NUM, 'font-mono font-semibold')}>
                  ${group.amountUsd.toFixed(4)}
                </TableCell>
                <TableCell className={NUM}>
                  <ShareBar
                    value=''
                    percentage={group.percentage}
                    className='min-w-[72px] sm:min-w-[120px]'
                  />
                </TableCell>
                {!compact && (
                  <TableCell>
                    <RatioCell
                      ratio={group.groupRatio}
                      exclusive={group.groupRatioExclusive}
                      totalQuota={group.quota}
                      label={t('Group ratio')}
                    />
                  </TableCell>
                )}
              </TableRow>
              {isOpen &&
                group.models.map((row) => (
                  <TableRow key={`${row.group}/${row.model_name}`}>
                    <TableCell className='pl-6 font-mono text-xs break-all whitespace-normal sm:pl-10'>
                      {row.model_name}
                    </TableCell>
                    {!compact && (
                      <>
                        <TableCell className={NUM}>
                          {number(row.count)}
                        </TableCell>
                        <TableCell className={NUM}>
                          {number(row.input_tokens)}
                        </TableCell>
                        <TableCell className={NUM}>
                          {number(row.cached_tokens)}
                        </TableCell>
                        <TableCell className={NUM}>
                          {number(
                            row.cache_creation_tokens -
                              row.cache_creation_1h_tokens
                          )}
                        </TableCell>
                        {split1h && (
                          <TableCell className={NUM}>
                            {number(row.cache_creation_1h_tokens)}
                          </TableCell>
                        )}
                        <TableCell className={NUM}>
                          {number(row.completion_tokens)}
                        </TableCell>
                        <TableCell className={NUM}>
                          {formatUnitPrice(row.unit_prices.input)}
                        </TableCell>
                        <TableCell className={NUM}>
                          {formatUnitPrice(row.unit_prices.cache_read)}
                        </TableCell>
                        <TableCell className={NUM}>
                          {formatUnitPrice(row.unit_prices.cache_write_5m)}
                        </TableCell>
                        {split1h && (
                          <TableCell className={NUM}>
                            {formatUnitPrice(row.unit_prices.cache_write_1h)}
                          </TableCell>
                        )}
                        <TableCell className={NUM}>
                          {formatUnitPrice(row.unit_prices.output)}
                        </TableCell>
                      </>
                    )}
                    <TableCell className={cn(NUM, 'font-mono')}>
                      ${Number.parseFloat(row.amount_usd).toFixed(4)}
                    </TableCell>
                    <TableCell className={NUM}>
                      <ShareBar
                        value=''
                        percentage={row.percentage}
                        className='min-w-[72px] sm:min-w-[120px]'
                      />
                    </TableCell>
                    {!compact && (
                      <TableCell>
                        <RatioCell
                          ratio={row.ratios.model_ratio}
                          totalQuota={row.quota}
                          label={t('Model ratio')}
                          perCallPrice={row.ratios.model_price}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
            </Fragment>
          )
        })}
      </TableBody>
    </StaticDataTable>
  )
}
