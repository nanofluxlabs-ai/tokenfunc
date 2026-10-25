import { ArrowLeft, Megaphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { EmptyState } from '@/components/empty-state'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DatePresetButtons } from '@/features/finance/components/date-preset-buttons'
import { DayRangeControls } from '@/features/finance/components/day-range-controls'
import { MetricCard } from '@/features/finance/components/metric-card'
import { useFinanceDateRange } from '@/features/finance/hooks/use-finance-date-range'
import {
  monthToDateRange,
  presetRange,
  type DatePresetId,
} from '@/features/finance/lib/date-presets'
import { generateAffiliateLink } from '@/features/wallet/lib/affiliate'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatQuota } from '@/lib/format'

import {
  PROMOTER_CENTER_TABS,
  PROMOTER_CENTER_TAB_TITLE_KEYS,
} from '../constants'
import {
  usePromoterModels,
  usePromoterOverview,
  usePromoterUsers,
} from '../hooks/use-promoter-center-queries'
import type {
  PromoterCenterTab,
  PromoterCenterUser,
  PromoterScope,
} from '../types'
import { DailyTab } from './daily-tab'
import { ModelsTab } from './models-tab'
import { UserUsageSheet } from './user-usage-sheet'
import { UsersTab } from './users-tab'

type SearchLike = Record<string, unknown>

export type PromoterCenterPageProps = {
  scope: PromoterScope
  search: SearchLike
  navigate: (opts: {
    search: (prev: SearchLike) => SearchLike
    replace?: boolean
  }) => void
  /** 管理员视角的返回按钮 */
  onBack?: () => void
}

function resolveTab(value: unknown): PromoterCenterTab {
  return PROMOTER_CENTER_TABS.includes(value as PromoterCenterTab)
    ? (value as PromoterCenterTab)
    : 'daily'
}

/** 推广中心：自助视图与管理员视角共用；区间 / tab 都同步在 URL search 里 */
export function PromoterCenterPage(props: PromoterCenterPageProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const isAdmin = props.scope.scope === 'admin'
  const range = useFinanceDateRange({
    search: props.search,
    navigate: props.navigate,
    startKey: 'start',
    endKey: 'end',
    fallback: monthToDateRange(),
  })
  const tab = resolveTab(props.search.tab)
  const rangeParams = useMemo(
    () => ({ start: range.applied.start, end: range.applied.end }),
    [range.applied.start, range.applied.end]
  )
  const overview = usePromoterOverview(props.scope, rangeParams)
  const users = usePromoterUsers(props.scope, rangeParams, tab === 'users')
  const models = usePromoterModels(props.scope, rangeParams, tab === 'models')
  const [inspecting, setInspecting] = useState<PromoterCenterUser | null>(null)

  const summary = overview.data?.summary
  const profile = overview.data?.promoter
  const referralLink = profile?.aff_code
    ? generateAffiliateLink(profile.aff_code)
    : ''
  const noUsers = !overview.isLoading && summary?.bound_user_count === 0

  const applyPreset = (preset: DatePresetId) => {
    const next = presetRange(preset)
    props.navigate({
      search: (previous) => ({ ...previous, start: next.start, end: next.end }),
    })
  }
  const setTab = (value: string) => {
    props.navigate({
      search: (previous) => ({ ...previous, tab: value }),
    })
  }

  return (
    <>
      <SectionPageLayout stackActionsOnMobile>
        <SectionPageLayout.Title>
          <span className='inline-flex items-baseline gap-2'>
            {t('Promoter Center')}
            {isAdmin && profile && (
              <span className='text-muted-foreground text-sm font-normal'>
                {profile.username}
                <span className='ml-1 font-mono'>#{profile.user_id}</span>
              </span>
            )}
          </span>
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <div className='flex flex-wrap items-center gap-2'>
            {referralLink && (
              <CopyButton
                value={referralLink}
                variant='outline'
                size='sm'
                tooltip={t('Copy referral link')}
                aria-label={t('Copy referral link')}
              >
                {t('Referral link')}
              </CopyButton>
            )}
            <DatePresetButtons
              presets={['today', 'month', 'lastMonth', 'last30']}
              onSelect={applyPreset}
            />
            <DayRangeControls
              draft={range.draft}
              onDraftChange={range.setDraft}
              onApply={range.apply}
              onReset={range.reset}
            />
            {props.onBack && (
              <Button variant='outline' size='sm' onClick={props.onBack}>
                <ArrowLeft className='h-4 w-4' />
                {t('Back')}
              </Button>
            )}
          </div>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='flex flex-col gap-4'>
            <p className='text-muted-foreground -mt-1 text-sm'>
              {t(
                'Consumption of users bound to this promoter, net of refunds. Users who signed up through the referral link are bound automatically.'
              )}
            </p>
            {profile && (
              <p className='text-muted-foreground -mt-2 text-sm'>
                {profile.share_rate > 0 &&
                  `${t('Share rate {{rate}}%', { rate: profile.share_rate })}. `}
                {t(
                  'Payouts are calculated on net profit after operating and resource costs; the settlement records are authoritative.'
                )}
              </p>
            )}
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <MetricCard
                label={t('Bound users')}
                value={formatCompactNumber(
                  summary?.bound_user_count ?? 0,
                  locale
                )}
                hint={t('{{count}} active in range', {
                  count: summary?.active_user_count ?? 0,
                })}
                loading={overview.isLoading}
              />
              <MetricCard
                label={t('Consumption in range')}
                value={formatQuota(summary?.net_quota ?? 0)}
                hint={t('Refunds {{amount}}', {
                  amount: formatQuota(summary?.refund_quota ?? 0),
                })}
                loading={overview.isLoading}
              />
              <MetricCard
                label={t('Requests')}
                value={formatCompactNumber(summary?.request_count ?? 0, locale)}
                loading={overview.isLoading}
              />
              <MetricCard
                label={t('Tokens')}
                value={formatCompactNumber(summary?.total_tokens ?? 0, locale)}
                hint={`${t('Input')} ${formatCompactNumber(summary?.prompt_tokens ?? 0, locale)} · ${t('Output')} ${formatCompactNumber(summary?.completion_tokens ?? 0, locale)}`}
                loading={overview.isLoading}
              />
            </div>
            {noUsers ? (
              <EmptyState
                icon={Megaphone}
                title={t('No bound users yet')}
                description={t(
                  'Share the referral link; users who sign up through it are bound to this promoter automatically.'
                )}
                bordered
              />
            ) : (
              <>
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList variant='line'>
                    {PROMOTER_CENTER_TABS.map((id) => (
                      <TabsTrigger key={id} value={id}>
                        {t(PROMOTER_CENTER_TAB_TITLE_KEYS[id])}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {tab === 'daily' && (
                  <DailyTab
                    daily={overview.data?.daily ?? []}
                    loading={overview.isLoading}
                  />
                )}
                {tab === 'users' && (
                  <UsersTab
                    users={users.data ?? []}
                    loading={users.isLoading}
                    fetching={users.isFetching}
                    showContact={isAdmin}
                    onInspect={setInspecting}
                  />
                )}
                {tab === 'models' && (
                  <ModelsTab
                    items={models.data?.items ?? []}
                    loading={models.isLoading}
                    fetching={models.isFetching}
                  />
                )}
              </>
            )}
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {/* SectionPageLayout 只渲染槽位子节点，Sheet 必须放在布局之外 */}
      <UserUsageSheet
        scope={props.scope}
        range={rangeParams}
        user={inspecting}
        open={inspecting !== null}
        onOpenChange={(open) => !open && setInspecting(null)}
      />
    </>
  )
}
