import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listFinanceOrders } from '../../api'
import { FINANCE_PAGE_SIZE, FINANCE_QUERY_KEY } from '../../constants'
import type { DayRange } from '../../lib/date-presets'
import {
  EMPTY_ORDERS_FILTER,
  ordersFilterFromSearch,
  ordersFilterToSearch,
  type OrdersFilterValue,
} from '../../lib/orders-filter'
import { useOrdersColumns } from './orders-columns'
import { OrdersFilterBar } from './orders-filter-bar'

const route = getRouteApi('/_authenticated/finance/$section')

type OrdersPanelProps = { range: DayRange }

export function OrdersPanel(props: OrdersPanelProps) {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const columns = useOrdersColumns()
  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: {
        pageKey: 'page',
        pageSizeKey: 'pageSize',
        defaultPage: 1,
        defaultPageSize: FINANCE_PAGE_SIZE,
      },
      globalFilter: { enabled: false },
    })
  const filter = ordersFilterFromSearch(search)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      FINANCE_QUERY_KEY,
      'orders',
      props.range.start,
      props.range.end,
      filter,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listFinanceOrders({
          start_date: props.range.start,
          end_date: props.range.end,
          keyword: filter.keyword || undefined,
          username: filter.username || undefined,
          order_type: filter.orderType === 'all' ? undefined : filter.orderType,
          status: filter.status === 'all' ? undefined : filter.status,
          payment_method:
            filter.payMethod === 'all' ? undefined : filter.payMethod,
          p: pagination.pageIndex + 1,
          page_size: pagination.pageSize,
        })
      ).data ?? { items: [], total: 0, page: 1, page_size: FINANCE_PAGE_SIZE },
    placeholderData: keepPreviousData,
  })

  const { table } = useDataTable({
    data: data?.items ?? [],
    columns,
    getRowId: (row) => row.id,
    pagination,
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    enableSorting: false,
    totalCount: data?.total ?? 0,
    ensurePageInRange,
  })

  const applyFilter = (value: OrdersFilterValue | null) =>
    void navigate({
      search: (previous) => ({
        ...previous,
        ...ordersFilterToSearch(value),
        page: undefined,
      }),
    })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No orders found')}
      skeletonKeyPrefix='finance-orders-skeleton'
      fixedHeight={false}
      paginationInFooter={false}
      applyHeaderSize
      toolbar={
        <OrdersFilterBar
          value={filter}
          onApply={applyFilter}
          onReset={() => applyFilter(EMPTY_ORDERS_FILTER)}
        />
      }
    />
  )
}
