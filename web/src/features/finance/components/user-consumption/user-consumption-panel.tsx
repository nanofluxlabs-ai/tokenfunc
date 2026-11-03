import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listUserConsumptions } from '../../api'
import { FINANCE_PAGE_SIZE, FINANCE_QUERY_KEY } from '../../constants'
import type { DayRange } from '../../lib/date-presets'
import { FILTER_BAR_BUTTON_CLASS } from '../../lib/filter-layout'
import { GroupFilterSelect } from '../group-filter-select'
import { useUserConsumptionColumns } from './user-consumption-columns'

const route = getRouteApi('/_authenticated/finance/$section')

/** 日期区间来自财务中心页头（各 tab 共用），本面板只管关键词筛选 */
export function UserConsumptionPanel(props: { range: DayRange }) {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const keyword = search.ucQ ?? ''
  const group = search.ucGroup ?? ''
  const [draftKeyword, setDraftKeyword] = useState(keyword)
  const [draftGroup, setDraftGroup] = useState(group)
  useEffect(() => {
    setDraftKeyword(keyword)
  }, [keyword])
  useEffect(() => {
    setDraftGroup(group)
  }, [group])

  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: {
        pageKey: 'ucPage',
        pageSizeKey: 'ucPageSize',
        defaultPage: 1,
        defaultPageSize: FINANCE_PAGE_SIZE,
      },
      globalFilter: { enabled: false },
    })
  const columns = useUserConsumptionColumns(props.range)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      FINANCE_QUERY_KEY,
      'user-consumptions',
      props.range.start,
      props.range.end,
      keyword,
      group,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listUserConsumptions({
          start_date: props.range.start,
          end_date: props.range.end,
          keyword: keyword || undefined,
          group: group || undefined,
          p: pagination.pageIndex + 1,
          page_size: pagination.pageSize,
        })
      ).data ?? { items: [], total: 0, page: 1, page_size: FINANCE_PAGE_SIZE },
    placeholderData: keepPreviousData,
  })

  const { table } = useDataTable({
    data: data?.items ?? [],
    columns,
    getRowId: (row) => String(row.user_id),
    pagination,
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    enableSorting: false,
    totalCount: data?.total ?? 0,
    ensurePageInRange,
  })

  const apply = () => {
    void navigate({
      search: (previous) => ({
        ...previous,
        ucQ: draftKeyword.trim() || undefined,
        ucGroup: draftGroup || undefined,
        ucPage: undefined,
      }),
    })
  }
  const reset = () => {
    setDraftKeyword('')
    setDraftGroup('')
    void navigate({
      search: (previous) => ({
        ...previous,
        ucQ: undefined,
        ucGroup: undefined,
        ucPage: undefined,
      }),
    })
  }

  return (
    <div className='flex flex-col gap-3'>
      {/* 手机端两列网格（筛选项一行、按钮一行），sm 起恢复单行 flex */}
      <div className='grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center'>
        <div className='relative min-w-0 sm:min-w-[240px] sm:flex-1'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2' />
          <Input
            value={draftKeyword}
            onChange={(event) => setDraftKeyword(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && apply()}
            placeholder={t('Username / User ID')}
            aria-label={t('Username / User ID')}
            className='pl-8'
          />
        </div>
        <GroupFilterSelect
          value={draftGroup}
          onChange={setDraftGroup}
          className='w-full sm:w-[160px]'
        />
        <Button size='sm' className={FILTER_BAR_BUTTON_CLASS} onClick={apply}>
          {t('Query user consumption')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          className={FILTER_BAR_BUTTON_CLASS}
          onClick={reset}
        >
          {t('Reset user consumption filters')}
        </Button>
      </div>
      <Alert className='bg-muted/40'>
        <AlertDescription>
          {t(
            'Sorted by net consumption, showing users with consumption records in the selected range. Enterprise accounts show the enterprise name and billing mode. Hover over or tap the balance or consumption to see input, cache, output, subscription, wallet and refund details. For credit-billed enterprises the balance column shows the remaining credit and the amount used this period (the bill is authoritative).'
          )}
        </AlertDescription>
      </Alert>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyTitle={t('No consumption in this range')}
        skeletonKeyPrefix='finance-user-consumption-skeleton'
        fixedHeight={false}
        paginationInFooter={false}
        applyHeaderSize
        toolbarProps={null}
      />
    </div>
  )
}
