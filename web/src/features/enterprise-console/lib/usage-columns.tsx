import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'

import type { StaticDataTableColumn } from '@/components/data-table'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import { UsageShareCell } from '../components/usage-share-cell'

type UsageRow = {
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  cache_tokens: number
  quota: number
}

type UsageColumnsOptions<TRow extends UsageRow> = {
  t: TFunction
  locale: Intl.LocalesArgument
  nameHeader: string
  nameCell: (row: TRow) => ReactNode
  /** 占比分母：区间内全部消耗 */
  totalQuota: number
  /** 缓存列：hit 只有缓存命中，hit-write 再加缓存写入，none 不显示（按日表） */
  cache: 'none' | 'hit' | 'hit-write'
}

/** 用量明细表的统一列：名称 / 调用次数 / 输入 / 缓存 / 输出 / 消耗 / 占比，概览与报表共用 */
export function buildUsageColumns<
  TRow extends UsageRow & { cache_creation_tokens?: number },
>(options: UsageColumnsOptions<TRow>): StaticDataTableColumn<TRow>[] {
  const { t, locale } = options
  const columns: StaticDataTableColumn<TRow>[] = [
    { id: 'name', header: options.nameHeader, cell: options.nameCell },
    {
      id: 'requests',
      header: t('Calls'),
      cell: (row) => formatNumber(row.request_count, locale),
    },
    {
      id: 'prompt',
      header: t('Prompt Tokens'),
      cell: (row) => formatCompactNumber(row.prompt_tokens, locale),
    },
  ]
  if (options.cache !== 'none') {
    columns.push({
      id: 'cache',
      header: t('Cache Hit'),
      cell: (row) => formatCompactNumber(row.cache_tokens, locale),
    })
  }
  if (options.cache === 'hit-write') {
    columns.push({
      id: 'cache-write',
      header: t('Cache Write'),
      cell: (row) =>
        formatCompactNumber(row.cache_creation_tokens ?? 0, locale),
    })
  }
  columns.push(
    {
      id: 'completion',
      header: t('Completion Tokens'),
      cell: (row) => formatCompactNumber(row.completion_tokens, locale),
    },
    {
      id: 'quota',
      header: t('Cost'),
      cell: (row) => (
        <span className='font-mono'>{formatQuotaWithCurrency(row.quota)}</span>
      ),
    },
    {
      id: 'share',
      header: t('Share'),
      cell: (row) => (
        <UsageShareCell value={row.quota} total={options.totalQuota} />
      ),
    }
  )
  return columns
}
