import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import type { UsageSnapshotGroup } from '@/features/enterprise-console/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'

const NUM = 'text-right tabular-nums'
// 手机上隐藏的次要数字列
const NUM_DESKTOP = `${NUM} hidden sm:table-cell`

/** 快照归因块（按模型 v1 / 按团队 / 按成员）：缓存两列旧快照没有，显示「-」 */
export function SnapshotGroupTable(props: {
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
      className: NUM_DESKTOP,
      cellClassName: NUM_DESKTOP,
      cell: (row) => number(row.prompt_tokens),
    },
    {
      id: 'cached',
      header: t('Cache hits'),
      className: NUM_DESKTOP,
      cellClassName: NUM_DESKTOP,
      cell: (row) => number(row.cache_tokens),
    },
    {
      id: 'cache_write',
      header: t('Cache writes'),
      className: NUM_DESKTOP,
      cellClassName: NUM_DESKTOP,
      cell: (row) => number(row.cache_creation_tokens),
    },
    {
      id: 'output',
      header: t('Output tokens'),
      className: NUM_DESKTOP,
      cellClassName: NUM_DESKTOP,
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
