import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { SortingState } from '@tanstack/react-table'
import { RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ChannelTypeTabs } from '@/features/channels/components/channel-type-tabs'
import { DayRangeControls } from '@/features/finance/components/day-range-controls'
import { useFinanceDateRange } from '@/features/finance/hooks/use-finance-date-range'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getChannelUsageStats } from './api'
import { BillingDatePresets } from './components/billing-date-presets'
import { ChannelUsageTable } from './components/channel-usage-table'
import { UsageSummaryCards } from './components/usage-summary-cards'
import {
  CHANNEL_USAGE_DEFAULT_SORT,
  CHANNEL_USAGE_PAGE_SIZE,
  CHANNEL_USAGE_QUERY_KEY,
  CHANNEL_USAGE_SORT_KEYS,
  CHANNEL_USAGE_STATUS_OPTIONS,
  type ChannelUsageSortKey,
} from './constants'
import { useChannelBreakdowns } from './hooks/use-channel-breakdowns'
import {
  billingCalendarDay,
  billingPresetRange,
  billingTodayRange,
  type BillingDatePresetId,
} from './lib/billing-day'
import { isChannelExpandable, parseExpandIds } from './lib/usage-metrics'
import type { ChannelUsageMetric } from './types'

const route = getRouteApi('/_authenticated/channels/usage')

/** Select 不接受空串做值，用 all 代表「全部状态」 */
const STATUS_ALL = 'all'

function isSortKey(value: string | undefined): value is ChannelUsageSortKey {
  return (CHANNEL_USAGE_SORT_KEYS as readonly string[]).includes(value ?? '')
}

export function ChannelUsagePage() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()

  const range = useFinanceDateRange({
    search,
    navigate,
    startKey: 'start',
    endKey: 'end',
    fallback: billingTodayRange(),
    resetKeys: ['page', 'expand'],
  })
  const keyword = search.keyword ?? ''
  const status = search.status ?? ''
  const channelType = search.type ?? ''
  const metric: ChannelUsageMetric = search.metric ?? 'official'
  const sortKey = isSortKey(search.sort)
    ? search.sort
    : CHANNEL_USAGE_DEFAULT_SORT
  const order = search.order ?? 'desc'
  const expandedIds = useMemo(
    () => parseExpandIds(search.expand),
    [search.expand]
  )

  // 输入框改动不立即写 URL，点「查询」才生效；URL 变化时在渲染期同步草稿（避免 effect 里 setState 的级联渲染）
  const [draftKeyword, setDraftKeyword] = useState(keyword)
  const [draftStatus, setDraftStatus] = useState(status)
  const [syncedSearch, setSyncedSearch] = useState({ keyword, status })
  if (syncedSearch.keyword !== keyword || syncedSearch.status !== status) {
    setSyncedSearch({ keyword, status })
    setDraftKeyword(keyword)
    setDraftStatus(status)
  }

  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: {
        pageKey: 'page',
        pageSizeKey: 'size',
        defaultPage: 1,
        defaultPageSize: CHANNEL_USAGE_PAGE_SIZE,
      },
      globalFilter: { enabled: false },
    })

  const applied = range.applied
  const isToday =
    applied.start === applied.end && applied.start === billingCalendarDay()
  const rangeLabel =
    applied.start === applied.end
      ? applied.start
      : `${applied.start} ~ ${applied.end}`
  const rangeColumnTitle = isToday ? t('Today value') : t('Range value')
  const rangeCardTitle = isToday
    ? t('Today (billing time zone)')
    : t('{{range}} (billing time zone)', { range: rangeLabel })

  const statsQuery = useQuery({
    queryKey: [
      CHANNEL_USAGE_QUERY_KEY,
      'stats',
      applied.start,
      applied.end,
      pagination.pageIndex,
      pagination.pageSize,
      sortKey,
      order,
      keyword,
      status,
      channelType,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getChannelUsageStats({
          start_date: applied.start,
          end_date: applied.end,
          page: pagination.pageIndex + 1,
          size: pagination.pageSize,
          sort: sortKey,
          order,
          keyword: keyword || undefined,
          status: status || undefined,
          type: channelType || undefined,
        })
      ).data,
    placeholderData: keepPreviousData,
  })
  const data = statsQuery.data
  const items = useMemo(() => data?.items ?? [], [data])

  const breakdowns = useChannelBreakdowns({
    range: applied,
    metric,
    expandedIds,
  })

  const expandableIds = useMemo(
    () => items.filter(isChannelExpandable).map((item) => item.id),
    [items]
  )
  // 列表刷新后丢掉不在当前页或已无消耗的展开行（URL 带入的 expand 要等列表回来再校验）
  useEffect(() => {
    if (!data || statsQuery.isFetching) return
    const allowed = new Set(expandableIds)
    const next = expandedIds.filter((id) => allowed.has(id))
    if (next.length === expandedIds.length) return
    void navigate({
      search: (previous) => ({
        ...previous,
        expand: next.length > 0 ? next.join(',') : undefined,
      }),
      replace: true,
    })
  }, [data, statsQuery.isFetching, expandableIds, expandedIds, navigate])

  const setExpandedIds = (next: number[]) =>
    void navigate({
      search: (previous) => ({
        ...previous,
        expand: next.length > 0 ? next.join(',') : undefined,
      }),
      replace: true,
    })
  const toggleExpand = (id: number) =>
    setExpandedIds(
      expandedIds.includes(id)
        ? expandedIds.filter((item) => item !== id)
        : [...expandedIds, id]
    )
  const allExpanded =
    expandableIds.length > 0 &&
    expandableIds.every((id) => expandedIds.includes(id))

  const applyFilters = () => {
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
        keyword: draftKeyword.trim() || undefined,
        status: draftStatus || undefined,
        start: range.draft.start,
        end: range.draft.end,
        page: undefined,
        expand: undefined,
      }),
    })
  }
  const resetFilters = () => {
    setDraftKeyword('')
    setDraftStatus('')
    void navigate({
      search: (previous) => ({
        ...previous,
        keyword: undefined,
        status: undefined,
        type: undefined,
        start: undefined,
        end: undefined,
        page: undefined,
        expand: undefined,
      }),
    })
  }
  const applyPreset = (preset: BillingDatePresetId) => {
    const next = billingPresetRange(preset)
    void navigate({
      search: (previous) => ({
        ...previous,
        start: next.start,
        end: next.end,
        page: undefined,
        expand: undefined,
      }),
    })
  }

  const sorting: SortingState = [{ id: sortKey, desc: order === 'desc' }]
  const onSortingChange = (next: SortingState) => {
    const first = next[0]
    void navigate({
      search: (previous) => ({
        ...previous,
        sort:
          first &&
          isSortKey(first.id) &&
          first.id !== CHANNEL_USAGE_DEFAULT_SORT
            ? first.id
            : undefined,
        order: first && !first.desc ? 'asc' : undefined,
        page: undefined,
      }),
    })
  }

  return (
    <SectionPageLayout stackActionsOnMobile>
      <SectionPageLayout.Title>{t('Channel Usage')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          <BillingDatePresets onSelect={applyPreset} />
          <DayRangeControls
            draft={range.draft}
            onDraftChange={range.setDraft}
            onApply={applyFilters}
            onReset={resetFilters}
          />
          <Button
            variant='outline'
            size='sm'
            onClick={() => void statsQuery.refetch()}
            disabled={statsQuery.isFetching}
          >
            <RefreshCw
              className={statsQuery.isFetching ? 'animate-spin' : undefined}
            />
            {t('Refresh')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <div className='text-muted-foreground -mt-1 flex flex-col gap-0.5 text-sm'>
            <p>
              {t(
                'Figures are the output value at official API prices (group discounts excluded). Total = all time; Range = the selected dates (billing time zone, defaults to today); This month = the current calendar month in the billing time zone.'
              )}
            </p>
            <p>
              {t(
                'Click a channel row to expand the top 5 payers and top 5 models in the selected range (refunds are not deducted; same basis as the range value).'
              )}
            </p>
          </div>
          <UsageSummaryCards
            summary={data?.summary}
            rangeTitle={rangeCardTitle}
            loading={statsQuery.isLoading}
          />
          <Card className='gap-3 py-4'>
            <CardContent className='flex flex-col gap-3 px-4'>
              <ChannelTypeTabs
                value={channelType}
                onValueChange={(value) =>
                  void navigate({
                    search: (previous) => ({
                      ...previous,
                      type: value || undefined,
                      page: undefined,
                      expand: undefined,
                    }),
                  })
                }
                availableTypes={data?.available_types ?? []}
                typeCounts={data?.type_counts ?? {}}
              />
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex flex-wrap items-center gap-2'>
                  <div className='relative min-w-[220px]'>
                    <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2' />
                    <Input
                      value={draftKeyword}
                      onChange={(event) => setDraftKeyword(event.target.value)}
                      onKeyDown={(event) =>
                        event.key === 'Enter' && applyFilters()
                      }
                      placeholder={t('Search channel name / remark')}
                      aria-label={t('Search channel name / remark')}
                      className='pl-8'
                    />
                  </div>
                  <Select
                    items={CHANNEL_USAGE_STATUS_OPTIONS.map((option) => ({
                      value: option.value || STATUS_ALL,
                      label: t(option.labelKey),
                    }))}
                    value={draftStatus || STATUS_ALL}
                    onValueChange={(value) =>
                      setDraftStatus(
                        value === null || value === STATUS_ALL
                          ? ''
                          : String(value)
                      )
                    }
                  >
                    <SelectTrigger aria-label={t('Status')} className='w-36'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {CHANNEL_USAGE_STATUS_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value || STATUS_ALL}
                            value={option.value || STATUS_ALL}
                          >
                            {t(option.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button size='sm' onClick={applyFilters}>
                    {t('Query')}
                  </Button>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <ToggleGroup
                    variant='outline'
                    size='sm'
                    value={[metric]}
                    onValueChange={(value: unknown[]) => {
                      const next = value[0]
                      if (next === 'official' || next === 'actual') {
                        void navigate({
                          search: (previous) => ({
                            ...previous,
                            metric: next === 'official' ? undefined : next,
                          }),
                          replace: true,
                        })
                      }
                    }}
                    aria-label={t('Ranking basis')}
                  >
                    <ToggleGroupItem value='official'>
                      {t('By official price')}
                    </ToggleGroupItem>
                    <ToggleGroupItem value='actual'>
                      {t('By actual charge')}
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={expandableIds.length === 0}
                    onClick={() =>
                      setExpandedIds(allExpanded ? [] : expandableIds)
                    }
                  >
                    {allExpanded ? t('Collapse all') : t('Expand all')}
                  </Button>
                </div>
              </div>
              <ChannelUsageTable
                items={items}
                total={data?.total ?? 0}
                isLoading={statsQuery.isLoading}
                isFetching={statsQuery.isFetching}
                rangeColumnTitle={rangeColumnTitle}
                range={applied}
                rangeLabel={rangeLabel}
                metric={metric}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                entries={breakdowns.entries}
                coverageStartTs={breakdowns.coverageStartTs}
                onRetryBreakdown={() => void breakdowns.refetch()}
                sorting={sorting}
                onSortingChange={onSortingChange}
                pagination={pagination}
                onPaginationChange={onPaginationChange}
                ensurePageInRange={ensurePageInRange}
              />
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
