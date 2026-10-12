import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ExpandedState, SortingState } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listModelConsumptions } from '../../api'
import { FINANCE_QUERY_KEY, MODEL_GROUP_PAGE_SIZE } from '../../constants'
import { useFinanceDateRange } from '../../hooks/use-finance-date-range'
import { todayRange } from '../../lib/date-presets'
import { buildModelConsumptionTree } from '../../lib/model-consumption-tree'
import { DayRangeControls } from '../day-range-controls'
import {
  formatModelCost,
  useModelConsumptionColumns,
} from './model-consumption-columns'

const route = getRouteApi('/_authenticated/finance/$section')

type Filters = { model: string; user: string; group: string }

function FilterInput(props: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
}) {
  return (
    <div className='relative min-w-[160px] flex-1'>
      <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2' />
      <Input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && props.onSubmit()}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        className='pl-8'
      />
    </div>
  )
}

export function ModelConsumptionPanel() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const range = useFinanceDateRange({
    search,
    navigate,
    startKey: 'mcStart',
    endKey: 'mcEnd',
    fallback: todayRange(),
  })
  const applied: Filters = {
    model: search.mcModel ?? '',
    user: search.mcUser ?? '',
    group: search.mcGroup ?? '',
  }
  const [draft, setDraft] = useState<Filters>(applied)
  useEffect(() => {
    setDraft(applied)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied.model, applied.user, applied.group])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      FINANCE_QUERY_KEY,
      'model-consumptions',
      range.applied.start,
      range.applied.end,
      applied,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listModelConsumptions({
          start_date: range.applied.start,
          end_date: range.applied.end,
          model_name: applied.model || undefined,
          username: applied.user || undefined,
          group: applied.group || undefined,
        })
      ).data ?? null,
    placeholderData: keepPreviousData,
  })

  const tree = useMemo(
    () =>
      buildModelConsumptionTree(data?.items ?? [], {
        ungrouped: t('Ungrouped'),
        unknownChannel: t('Unknown channel'),
      }),
    [data?.items, t]
  )
  // 默认展开全部分组、折叠模型；数据刷新后重置
  const [expanded, setExpanded] = useState<ExpandedState>({})
  useEffect(() => {
    setExpanded(Object.fromEntries(tree.nodes.map((node) => [node.id, true])))
  }, [tree])
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'cost', desc: true },
  ])

  const columns = useModelConsumptionColumns()
  const { table } = useDataTable({
    data: tree.nodes,
    columns,
    getRowId: (row) => row.id,
    getSubRows: (row) => row.children,
    withExpandedRowModel: true,
    withSortedRowModel: true,
    withPaginationRowModel: true,
    paginateExpandedRows: false,
    expanded,
    onExpandedChange: setExpanded,
    sorting,
    onSortingChange: setSorting,
    initialPagination: { pageIndex: 0, pageSize: MODEL_GROUP_PAGE_SIZE },
  })

  const apply = () => {
    if (
      !range.draft.start ||
      !range.draft.end ||
      range.draft.start > range.draft.end
    ) {
      return
    }
    void navigate({
      search: (previous) => ({
        ...previous,
        mcModel: draft.model.trim() || undefined,
        mcUser: draft.user.trim() || undefined,
        mcGroup: draft.group.trim() || undefined,
        mcStart: range.draft.start,
        mcEnd: range.draft.end,
      }),
    })
  }
  const reset = () => {
    setDraft({ model: '', user: '', group: '' })
    void navigate({
      search: (previous) => ({
        ...previous,
        mcModel: undefined,
        mcUser: undefined,
        mcGroup: undefined,
        mcStart: undefined,
        mcEnd: undefined,
      }),
    })
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <FilterInput
          value={draft.model}
          onChange={(model) => setDraft({ ...draft, model })}
          onSubmit={apply}
          placeholder={t('Model name')}
        />
        <FilterInput
          value={draft.user}
          onChange={(user) => setDraft({ ...draft, user })}
          onSubmit={apply}
          placeholder={t('Username')}
        />
        <FilterInput
          value={draft.group}
          onChange={(group) => setDraft({ ...draft, group })}
          onSubmit={apply}
          placeholder={t('Group')}
        />
        <DayRangeControls
          draft={range.draft}
          onDraftChange={range.setDraft}
          onApply={apply}
          onReset={reset}
          applyLabel={t('Query model consumption')}
          resetLabel={t('Reset model consumption filters')}
        />
      </div>
      <Alert className='bg-muted/40'>
        <AlertDescription className='flex flex-col gap-1'>
          <p className='font-medium'>
            {t(
              'Amounts on this page are the actual billed amounts after model, completion/cache, group and user ratios, net of refunds; they are not list prices.'
            )}
          </p>
          <p>
            {t(
              'Net consumption (consumption minus refunds) in the selected range is grouped by group → model → channel. Group and model shares use the overall total as the denominator, so each level sums to 100%; channel shares use the model total. Groups are expanded by default, sorted by cost, and the default range is today.'
            )}
          </p>
          <p className='flex flex-wrap gap-x-4 gap-y-1'>
            <span>
              {t('Total cost')}:{' '}
              <strong className='font-mono'>
                {formatModelCost(tree.stats.netQuota)}
              </strong>
            </span>
            <span>
              {t('Groups')}: {tree.stats.groupCount}
            </span>
            <span>
              {t('Model combinations')}: {tree.stats.modelCombinationCount}
            </span>
            <span>
              {t('Total requests')}:{' '}
              {formatCompactNumber(tree.stats.consumeCount, locale)}
            </span>
          </p>
          {data?.summary.truncated && (
            <p className='text-warning'>
              {t(
                'Too many rows; only the top {{count}} rows by cost are shown.',
                {
                  count: data.summary.row_count,
                }
              )}
            </p>
          )}
        </AlertDescription>
      </Alert>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyTitle={t('No consumption in this range')}
        skeletonKeyPrefix='finance-model-consumption-skeleton'
        fixedHeight={false}
        paginationInFooter={false}
        compactPagination
        applyHeaderSize
        toolbarProps={null}
      />
    </div>
  )
}
