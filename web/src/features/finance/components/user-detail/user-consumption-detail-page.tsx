import { getRouteApi, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { useFinanceDateRange } from '../../hooks/use-finance-date-range'
import { useUsageSummary } from '../../hooks/use-usage-breakdown-queries'
import { buildUsageCsvFilename } from '../../lib/csv'
import {
  dayRangeToTimestamps,
  presetRange,
  todayRange,
  type DatePresetId,
} from '../../lib/date-presets'
import { countDistinctModels } from '../../lib/usage-breakdown'
import { DayRangeControls } from '../day-range-controls'
import { MetricCard } from '../metric-card'
import { ExportCsvControl } from '../usage-breakdown/export-csv-control'
import { UsageBreakdownSection } from '../usage-breakdown/usage-breakdown-section'

const route = getRouteApi('/_authenticated/finance/users/$userId')

const PRESETS: { id: DatePresetId; labelKey: string }[] = [
  { id: 'today', labelKey: 'Today' },
  { id: 'month', labelKey: 'Current month' },
  { id: 'lastMonth', labelKey: 'Last month' },
  { id: 'last30', labelKey: 'Last 30 days' },
]

export function UserConsumptionDetailPage() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const router = useRouter()
  const params = route.useParams()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const userId = Number(params.userId)
  const range = useFinanceDateRange({
    search,
    navigate,
    startKey: 'start',
    endKey: 'end',
    fallback: todayRange(),
  })
  const timestamps = useMemo(
    () => dayRangeToTimestamps(range.applied),
    [range.applied]
  )
  const usageParams = { user_id: userId, ...timestamps }
  const summary = useUsageSummary(usageParams)
  const title = search.username || `#${params.userId}`

  const applyPreset = (preset: DatePresetId) => {
    const next = presetRange(preset)
    void navigate({
      search: (previous) => ({ ...previous, start: next.start, end: next.end }),
    })
  }
  const goBack = () => {
    if (router.history.length > 1) {
      router.history.back()
      return
    }
    void navigate({
      to: '/finance/$section',
      params: { section: 'user-consumption' },
      search: { ucStart: range.applied.start, ucEnd: range.applied.end },
    })
  }

  return (
    <SectionPageLayout stackActionsOnMobile>
      <SectionPageLayout.Title>
        <span className='inline-flex items-baseline gap-2'>
          {title}
          <span className='text-muted-foreground font-mono text-sm font-normal'>
            #{params.userId}
          </span>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          {PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant='outline'
              size='sm'
              onClick={() => applyPreset(preset.id)}
            >
              {t(preset.labelKey)}
            </Button>
          ))}
          <DayRangeControls
            draft={range.draft}
            onDraftChange={range.setDraft}
            onApply={range.apply}
            onReset={range.reset}
          />
          <ExportCsvControl
            {...usageParams}
            filename={buildUsageCsvFilename(
              title,
              range.applied.start,
              range.applied.end,
              t('usage')
            )}
          />
          <Button variant='outline' size='sm' onClick={goBack}>
            <ArrowLeft className='h-4 w-4' />
            {t('Back')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-4'>
          <p className='text-muted-foreground -mt-1 text-sm'>
            {t('User consumption details')}
          </p>
          <div className='grid gap-3 sm:grid-cols-3'>
            <MetricCard
              label={t('Requests')}
              value={formatNumber(summary.data?.total_calls ?? 0, locale)}
              loading={summary.isLoading}
            />
            <MetricCard
              label={t('Total amount (USD)')}
              value={`$${Number.parseFloat(summary.data?.total_amount_usd ?? '0').toFixed(4)}`}
              loading={summary.isLoading}
            />
            <MetricCard
              label={t('Models involved')}
              value={countDistinctModels(summary.data?.by_group_model ?? [])}
              loading={summary.isLoading}
            />
          </div>
          <UsageBreakdownSection {...usageParams} />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
