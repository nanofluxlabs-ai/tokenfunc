/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'
import {
  formatCompactNumber,
  formatLogQuota,
  formatPercent,
} from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getLogStats, getUserLogStats } from '../api'
import { DEFAULT_LOG_STATS } from '../constants'
import { buildApiParams } from '../lib/utils'
import { useLogsViewScope, useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

function StatBadge(props: {
  label: string
  value: string | number
  accent: string
  hint?: ReactNode
}) {
  const badge = (
    <span className='border-border/60 bg-muted/25 inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs shadow-xs'>
      <span className={cn('h-4 w-0.5 rounded-full', props.accent)} />
      <span className='text-muted-foreground'>{props.label}</span>
      <span className='text-foreground/90 font-mono text-sm font-semibold tabular-nums'>
        {props.value}
      </span>
    </span>
  )
  if (!props.hint) return badge
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className='cursor-help' />}>
        {badge}
      </TooltipTrigger>
      <TooltipContent>{props.hint}</TooltipContent>
    </Tooltip>
  )
}

function HintRows(props: { rows: [string, string][] }) {
  return (
    <div className='grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5'>
      {props.rows.map(([label, value]) => (
        <div key={label} className='contents'>
          <span>{label}</span>
          <span className='text-right font-mono tabular-nums'>{value}</span>
        </div>
      ))}
    </div>
  )
}

export function CommonLogsStats() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { isAdminView: isAdmin } = useLogsViewScope()
  const searchParams = route.useSearch()
  const { sensitiveVisible } = useUsageLogsContext()

  const { data, isLoading } = useQuery({
    queryKey: ['usage-logs-stats', isAdmin, searchParams],
    queryFn: async () => {
      const params = buildApiParams({
        page: 1,
        pageSize: 1,
        searchParams,
        columnFilters: [],
        isAdmin,
      })

      const result = isAdmin
        ? requireServerSuccess(await getLogStats(params))
        : requireServerSuccess(await getUserLogStats(params))

      return result.success
        ? { ...DEFAULT_LOG_STATS, ...result.data }
        : DEFAULT_LOG_STATS
    },
    placeholderData: (previousData) => previousData,
  })

  if (isLoading) {
    return (
      <div className='flex items-center gap-2'>
        <Skeleton className='h-8 w-[110px] rounded-md' />
        <Skeleton className='h-8 w-[150px] rounded-md' />
        <Skeleton className='h-8 w-[160px] rounded-md' />
        <Skeleton className='h-8 w-[110px] rounded-md' />
        <Skeleton className='h-8 w-[150px] rounded-md' />
      </div>
    )
  }

  const stats = data || DEFAULT_LOG_STATS
  const compact = (value: number) => formatCompactNumber(value, locale)
  const masked = (value: string) => (sensitiveVisible ? value : '••••')
  const totalTokens = stats.input_tokens_total + stats.completion_tokens
  const cacheRate =
    stats.input_tokens_total > 0
      ? (stats.cache_read_tokens / stats.input_tokens_total) * 100
      : 0
  const attempts = stats.requests + stats.error_count
  const failureRate = attempts > 0 ? (stats.error_count / attempts) * 100 : 0

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <StatBadge
        label={t('Requests')}
        value={compact(stats.requests)}
        accent='bg-emerald-500/70'
      />
      <StatBadge
        label={t('Net usage')}
        value={masked(formatLogQuota(stats.net_quota))}
        accent='bg-sky-500/70'
        hint={
          stats.refund_quota > 0 && sensitiveVisible ? (
            <HintRows
              rows={[
                [t('Consumed'), formatLogQuota(stats.consume_quota)],
                [t('Refunded'), formatLogQuota(stats.refund_quota)],
              ]}
            />
          ) : undefined
        }
      />
      <StatBadge
        label={t('Tokens')}
        value={
          stats.cache_read_tokens > 0
            ? `${compact(totalTokens)} · ${t('Cache hit {{rate}}', { rate: formatPercent(cacheRate) })}`
            : compact(totalTokens)
        }
        accent='bg-violet-500/65'
        hint={
          <HintRows
            rows={[
              [t('Input (incl. cache)'), compact(stats.input_tokens_total)],
              [t('Output'), compact(stats.completion_tokens)],
              [t('Cache read'), compact(stats.cache_read_tokens)],
              [t('Cache write'), compact(stats.cache_write_tokens)],
            ]}
          />
        }
      />
      {stats.error_log_enabled && (
        <StatBadge
          label={t('Failure rate')}
          value={formatPercent(failureRate)}
          accent='bg-rose-500/65'
          hint={t('{{errors}} errors out of {{total}} requests', {
            errors: compact(stats.error_count),
            total: compact(attempts),
          })}
        />
      )}
      <StatBadge
        label={t('Live RPM / TPM')}
        value={`${compact(stats.rpm)} / ${compact(stats.tpm)}`}
        accent='bg-slate-400/70'
        hint={t('Last 60 seconds, not affected by the time range')}
      />
    </div>
  )
}
