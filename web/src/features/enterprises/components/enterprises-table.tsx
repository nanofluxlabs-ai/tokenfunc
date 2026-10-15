import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { createServerError } from '@/lib/server-error-message'

import { listEnterprises } from '../api'
import { ENTERPRISE_BILLING_MODES, ERROR_MESSAGES } from '../constants'
import { resolveBillingColumnVisibility } from '../lib/column-visibility'
import type { EnterpriseBillingMode } from '../types'
import { useEnterprisesColumns } from './enterprises-columns'
import { useEnterprises } from './enterprises-provider'

const route = getRouteApi('/_authenticated/users/')

export function EnterprisesTable() {
  const { t } = useTranslation()
  const columns = useEnterprisesColumns()
  const { refreshTrigger } = useEnterprises()
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
    columnFilters: [
      { columnId: 'billing_mode', searchKey: 'billingMode', type: 'array' },
    ],
  })
  const billingModeFilter =
    (
      columnFilters.find((filter) => filter.id === 'billing_mode')?.value as
        | string[]
        | undefined
    )?.[0] ?? ''

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'admin-enterprises',
      pagination.pageIndex + 1,
      pagination.pageSize,
      globalFilter,
      billingModeFilter,
      refreshTrigger,
    ],
    queryFn: async () => {
      const result = await listEnterprises({
        keyword: globalFilter?.trim() || undefined,
        billing_mode: billingModeFilter || undefined,
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

  // 余额 / 已使用只对预付企业有意义，授信三列只对授信企业有意义：按当前页数据收起没用的列
  const items = data?.items
  useEffect(() => {
    if (!items || items.length === 0) return
    const visibility = resolveBillingColumnVisibility(items)
    table.setColumnVisibility((previous) => ({ ...previous, ...visibility }))
  }, [items, table])

  const billingModeOptions = useMemo(
    () =>
      (Object.keys(ENTERPRISE_BILLING_MODES) as EnterpriseBillingMode[]).map(
        (mode) => ({
          value: mode,
          label: t(ENTERPRISE_BILLING_MODES[mode].labelKey),
        })
      ),
    [t]
  )

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No Enterprises Found')}
      emptyDescription={t(
        'Create an enterprise account or upgrade an existing user.'
      )}
      skeletonKeyPrefix='enterprises-skeleton'
      applyHeaderSize
      toolbarProps={{
        searchPlaceholder: t('Search by enterprise, contact or account...'),
        searchDebounceMs: 500,
        filters: [
          {
            columnId: 'billing_mode',
            title: t('Billing Mode'),
            options: billingModeOptions,
            singleSelect: true,
          },
        ],
      }}
    />
  )
}
