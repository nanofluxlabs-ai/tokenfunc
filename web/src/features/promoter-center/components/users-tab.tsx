import type { SortingState } from '@tanstack/react-table'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'

import { PROMOTER_CENTER_PAGE_SIZE } from '../constants'
import type { PromoterCenterUser } from '../types'
import { usePromoterUsersColumns } from './users-columns'

type UsersTabProps = {
  users: PromoterCenterUser[]
  loading?: boolean
  fetching?: boolean
  showContact: boolean
  onInspect: (user: PromoterCenterUser) => void
}

/** 名下用户消耗：本地分页 + 排序（后端一次给全量，含 0 消耗用户） */
export function UsersTab(props: UsersTabProps) {
  const { t } = useTranslation()
  const columns = usePromoterUsersColumns({
    showContact: props.showContact,
    onInspect: props.onInspect,
  })
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'net_quota', desc: true },
  ])
  const { table } = useDataTable({
    data: props.users,
    columns,
    getRowId: (row) => String(row.user_id),
    withSortedRowModel: true,
    withPaginationRowModel: true,
    sorting,
    onSortingChange: setSorting,
    initialPagination: { pageIndex: 0, pageSize: PROMOTER_CENTER_PAGE_SIZE },
  })
  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={props.loading}
      isFetching={props.fetching}
      emptyTitle={t('No bound users yet')}
      skeletonKeyPrefix='promoter-users-skeleton'
      fixedHeight={false}
      paginationInFooter={false}
      compactPagination
      applyHeaderSize
      toolbarProps={null}
    />
  )
}
