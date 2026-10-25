import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { createServerError } from '@/lib/server-error-message'

import { listPromoters } from '../api'
import { ERROR_MESSAGES, PROMOTERS_QUERY_KEY } from '../constants'
import { usePromotersColumns } from './promoters-columns'
import { usePromoters } from './promoters-provider'

const route = getRouteApi('/_authenticated/promoters/')

export function PromotersTable() {
  const { t } = useTranslation()
  const columns = usePromotersColumns()
  const { refreshTrigger } = usePromoters()
  const isMobile = useMediaQuery('(max-width: 640px)')

  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
    globalFilter: { enabled: true, key: 'filter' },
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      PROMOTERS_QUERY_KEY,
      pagination.pageIndex + 1,
      pagination.pageSize,
      globalFilter,
      refreshTrigger,
    ],
    queryFn: async () => {
      const result = await listPromoters({
        keyword: globalFilter?.trim() || undefined,
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
      })
      if (!result.success) {
        throw createServerError(result, t(ERROR_MESSAGES.LOAD_FAILED))
      }
      return { items: result.data?.items || [], total: result.data?.total || 0 }
    },
    placeholderData: (previousData) => previousData,
  })

  const { table } = useDataTable({
    data: data?.items || [],
    columns,
    getRowId: (row) => String(row.id),
    // 工具栏读 table 状态里的 columnFilters，必须传空数组而不是省略
    columnFilters,
    globalFilter,
    pagination,
    onPaginationChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No promoters yet')}
      emptyDescription={t(
        'Add a promoter to start tracking referred consumption.'
      )}
      skeletonKeyPrefix='promoters-skeleton'
      applyHeaderSize
      toolbarProps={{
        searchPlaceholder: t('Search by username, ID, email or remark...'),
        searchDebounceMs: 500,
      }}
    />
  )
}
