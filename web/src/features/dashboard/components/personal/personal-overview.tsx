import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useStatus } from '@/hooks/use-status'
import { getSelf } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { type AuthUser, useAuthStore } from '@/stores/auth-store'

import { getFlowQuotaDates, getUserQuotaDates } from '../../api'
import {
  buildHourlyHeatmap,
  buildKeyRanking,
  buildPersonalSnapshot,
  buildRangeBreakdown,
  personalFetchStart,
  personalRangeStart,
  type PersonalRangeDays,
} from '../../lib/personal-overview'
import { DailySummaryTable } from './daily-summary-table'
import { HourlyHeatmapCard } from './hourly-heatmap-card'
import { KeyRankingCard } from './key-ranking-card'
import { ModelShareCard } from './model-share-card'
import { PersonalHero } from './personal-hero'
import { PersonalKpiCards } from './personal-kpi-cards'
import { UsageTrendCard } from './usage-trend-card'

const PERSONAL_QUERY_ROOT = ['dashboard', 'personal'] as const
const KEY_RANKING_LIMIT = 8

/** 普通用户概览：Hero + KPI + 区间图表；数据全部来自 quota_data 小时聚合，在前端按本地时区汇总 */
export function PersonalOverview() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const storeUser = useAuthStore((state) => state.auth.user)
  const { status } = useStatus()
  // 刷新时更新锚点时间，所有派生口径（今天、本月、区间）都跟着重算
  const [anchor, setAnchor] = useState(() => new Date())
  const [rangeDays, setRangeDays] = useState<PersonalRangeDays>(7)

  // 管理员关闭「数据导出」后 quota_data 不再落库，图表无从统计
  const dataExportEnabled = status?.enable_data_export !== false

  const endTimestamp = Math.floor(anchor.getTime() / 1000)
  const fetchStart = Math.floor(personalFetchStart(anchor).getTime() / 1000)
  const rangeStart = Math.floor(
    personalRangeStart(anchor, rangeDays).getTime() / 1000
  )

  const selfQuery = useQuery({
    queryKey: [...PERSONAL_QUERY_ROOT, 'self'],
    queryFn: async () => {
      const result = requireServerSuccess(await getSelf())
      return (result.data ?? null) as AuthUser | null
    },
    staleTime: 60 * 1000,
  })

  const quotaQuery = useQuery({
    queryKey: [...PERSONAL_QUERY_ROOT, 'quota', fetchStart, endTimestamp],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates({
          start_timestamp: fetchStart,
          end_timestamp: endTimestamp,
        })
      ).data ?? [],
    enabled: dataExportEnabled,
    staleTime: 60 * 1000,
  })

  const flowQuery = useQuery({
    queryKey: [...PERSONAL_QUERY_ROOT, 'flow', rangeStart, endTimestamp],
    queryFn: async () =>
      requireServerSuccess(
        await getFlowQuotaDates({
          start_timestamp: rangeStart,
          end_timestamp: endTimestamp,
        })
      ).data ?? [],
    enabled: dataExportEnabled,
    staleTime: 60 * 1000,
  })

  const rows = quotaQuery.data
  const snapshot = useMemo(
    () => buildPersonalSnapshot(rows ?? [], anchor),
    [anchor, rows]
  )
  const breakdown = useMemo(
    () => buildRangeBreakdown(rows ?? [], anchor, rangeDays),
    [anchor, rangeDays, rows]
  )
  const heatmap = useMemo(
    () => buildHourlyHeatmap(rows ?? [], anchor),
    [anchor, rows]
  )
  const keyRanking = useMemo(
    () => buildKeyRanking(flowQuery.data ?? [], KEY_RANKING_LIMIT),
    [flowQuery.data]
  )

  const user = selfQuery.data ?? storeUser
  const usageLoading = dataExportEnabled && quotaQuery.isLoading
  const refreshing =
    selfQuery.isFetching || quotaQuery.isFetching || flowQuery.isFetching

  const handleRefresh = () => {
    setAnchor(new Date())
    queryClient.invalidateQueries({ queryKey: [...PERSONAL_QUERY_ROOT] })
  }

  return (
    <div className='flex flex-col gap-4'>
      <PersonalHero
        user={user}
        snapshot={snapshot}
        now={anchor}
        usageReady={dataExportEnabled && quotaQuery.isSuccess}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

      {!dataExportEnabled ? (
        <EmptyState
          bordered
          icon={BarChart3}
          title={t('Usage statistics are turned off')}
          description={t(
            'The administrator has disabled usage data export, so charts are unavailable.'
          )}
        />
      ) : (
        <>
          <PersonalKpiCards snapshot={snapshot} loading={usageLoading} />

          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h2 className='text-sm font-semibold'>{t('Usage analysis')}</h2>
            <ToggleGroup
              variant='outline'
              size='sm'
              value={[String(rangeDays)]}
              onValueChange={(value: unknown[]) => {
                const next = Number(value[0])
                if (next === 7 || next === 30) setRangeDays(next)
              }}
              aria-label={t('Time range')}
            >
              <ToggleGroupItem value='7'>{t('Last 7 days')}</ToggleGroupItem>
              <ToggleGroupItem value='30'>{t('Last 30 days')}</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]'>
            <UsageTrendCard breakdown={breakdown} loading={usageLoading} />
            <ModelShareCard breakdown={breakdown} loading={usageLoading} />
          </div>

          <div className='grid gap-4 xl:grid-cols-2'>
            <HourlyHeatmapCard cells={heatmap} loading={usageLoading} />
            <KeyRankingCard
              keys={keyRanking}
              loading={dataExportEnabled && flowQuery.isLoading}
            />
          </div>

          <DailySummaryTable breakdown={breakdown} loading={usageLoading} />
        </>
      )}
    </div>
  )
}
