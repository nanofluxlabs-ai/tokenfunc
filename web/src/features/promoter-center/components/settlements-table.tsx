import type { ExpandedState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'

import { DataTablePage, useDataTable } from '@/components/data-table'

import { PROMOTER_SETTLEMENT_PAGE_SIZE } from '../constants'
import { buildSettlementTree } from '../lib/settlement-tree'
import type { PromoterSettlementMonth } from '../types'
import {
  useSettlementsColumns,
  type SettlementActions,
} from './settlements-columns'

type SettlementsTableProps = {
  items: PromoterSettlementMonth[]
  loading?: boolean
  fetching?: boolean
  /** 管理员视图：多流水号 / 操作人 / 核销数 */
  showOperator: boolean
  /** 管理端：标记 / 撤销 */
  actions?: SettlementActions
  emptyTitle: string
}

/** 结算树形表：月份行 → 该月每个绑定用户；推广中心「结算」tab 与管理端结算抽屉共用 */
export function SettlementsTable(props: SettlementsTableProps) {
  const rows = useMemo(() => buildSettlementTree(props.items), [props.items])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const columns = useSettlementsColumns({
    showOperator: props.showOperator,
    actions: props.actions,
  })
  const { table } = useDataTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.children,
    withExpandedRowModel: true,
    withPaginationRowModel: true,
    paginateExpandedRows: false,
    expanded,
    onExpandedChange: setExpanded,
    initialPagination: {
      pageIndex: 0,
      pageSize: PROMOTER_SETTLEMENT_PAGE_SIZE,
    },
  })
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={props.loading ?? false}
      isFetching={props.fetching ?? false}
      emptyTitle={props.emptyTitle}
      skeletonKeyPrefix='promoter-settlements-skeleton'
      fixedHeight={false}
      paginationInFooter={false}
      compactPagination
      applyHeaderSize
      toolbarProps={null}
    />
  )
}
