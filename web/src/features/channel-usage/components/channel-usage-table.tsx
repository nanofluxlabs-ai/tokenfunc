import type { SortingState } from '@tanstack/react-table'
import { Fragment, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePage,
  DataTableRow,
  useDataTable,
} from '@/components/data-table'
import { TableCell, TableRow } from '@/components/ui/table'
import type { DayRange } from '@/features/finance/lib/date-presets'
import { cn } from '@/lib/utils'

import type { BreakdownEntry } from '../hooks/use-channel-breakdowns'
import { isChannelExpandable } from '../lib/usage-metrics'
import type { ChannelUsageItem, ChannelUsageMetric } from '../types'
import { ChannelBreakdownPanel } from './breakdown-panel'
import { useChannelUsageColumns } from './channel-usage-columns'

type ChannelUsageTableProps = {
  items: ChannelUsageItem[]
  total: number
  isLoading: boolean
  isFetching: boolean
  rangeColumnTitle: string
  range: DayRange
  rangeLabel: string
  metric: ChannelUsageMetric
  expandedIds: number[]
  onToggleExpand: (id: number) => void
  entries: Map<number, BreakdownEntry>
  coverageStartTs: number
  onRetryBreakdown: () => void
  sorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  pagination: { pageIndex: number; pageSize: number }
  onPaginationChange: Parameters<typeof useDataTable>[0]['onPaginationChange']
  ensurePageInRange: (pageCount: number) => void
}

/** 渠道消耗列表：整行可点展开明细；区间内无调用的渠道不可展开 */
export function ChannelUsageTable(props: ChannelUsageTableProps) {
  const { t } = useTranslation()
  const { expandedIds } = props
  const isExpanded = useCallback(
    (id: number) => expandedIds.includes(id),
    [expandedIds]
  )
  const columns = useChannelUsageColumns({
    rangeColumnTitle: props.rangeColumnTitle,
    isExpanded,
    isExpandable: isChannelExpandable,
  })

  const { table } = useDataTable({
    data: props.items,
    columns,
    getRowId: (row) => String(row.id),
    pagination: props.pagination,
    onPaginationChange: props.onPaginationChange,
    sorting: props.sorting,
    onSortingChange: (updater) =>
      props.onSortingChange(
        typeof updater === 'function' ? updater(props.sorting) : updater
      ),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    totalCount: props.total,
    ensurePageInRange: props.ensurePageInRange,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={props.isLoading}
      isFetching={props.isFetching}
      emptyTitle={t('No channels match the filters')}
      skeletonKeyPrefix='channel-usage-skeleton'
      fixedHeight={false}
      paginationInFooter={false}
      applyHeaderSize
      hideMobile
      toolbarProps={null}
      renderRow={(row, helpers) => {
        const channel = row.original
        const expandable = isChannelExpandable(channel)
        const expanded = expandable && isExpanded(channel.id)
        return (
          <Fragment key={row.id}>
            <DataTableRow
              row={row}
              getColumnClassName={(columnId) =>
                helpers.getCellClassName(columnId)
              }
              cellRenderColumns={table.options.columns}
              className={cn(expandable && 'cursor-pointer')}
              data-expandable={expandable ? 'true' : undefined}
              aria-expanded={expandable ? expanded : undefined}
              onClick={
                expandable ? () => props.onToggleExpand(channel.id) : undefined
              }
            />
            {expanded && (
              <TableRow
                data-slot='channel-usage-breakdown-row'
                className='hover:bg-transparent'
              >
                <TableCell
                  colSpan={columns.length}
                  className='bg-muted/30 px-4 py-3 whitespace-normal'
                >
                  {/* 手机上宽表要横滑，明细面板钉在视口内，不跟表格一起被撑到约 1090px */}
                  <div className='sticky left-0 max-w-[calc(100vw-3rem)] sm:max-w-none'>
                    <ChannelBreakdownPanel
                      channel={channel}
                      entry={props.entries.get(channel.id)}
                      range={props.range}
                      rangeLabel={props.rangeLabel}
                      metric={props.metric}
                      coverageStartTs={props.coverageStartTs}
                      onRetry={props.onRetryBreakdown}
                    />
                  </div>
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        )
      }}
    />
  )
}
