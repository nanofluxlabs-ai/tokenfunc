import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatQuota } from '@/lib/format'

import { usePromoterOverview } from '../hooks/use-promoter-center-queries'
import { usePromoterSelf } from '../hooks/use-promoter-self'

/**
 * 钱包页「推荐计划」卡里的推广人附加行：名下用户 / 本月消耗 / 进入推广中心。
 * 非推广人渲染 null，上游卡片其余部分不变。
 */
export function PromoterSummaryRow(props: { className?: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const promoter = usePromoterSelf()
  const overview = usePromoterOverview(
    { scope: 'self' },
    undefined,
    Boolean(promoter.data)
  )
  if (!promoter.data) return null
  const summary = overview.data?.summary
  return (
    <div
      data-testid='promoter-summary-row'
      className={
        props.className ??
        'bg-background/70 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-xs lg:col-span-3'
      }
    >
      <span className='font-semibold'>{t('Promoter')}</span>
      <span className='text-muted-foreground'>
        {t('Bound users')}:{' '}
        <strong className='text-foreground tabular-nums'>
          {formatCompactNumber(summary?.bound_user_count ?? 0, locale)}
        </strong>
      </span>
      <span className='text-muted-foreground'>
        {t('This month')}:{' '}
        <strong className='text-foreground font-mono'>
          {formatQuota(summary?.net_quota ?? 0)}
        </strong>
      </span>
      <Link
        to='/promoter-center'
        className='text-primary ml-auto inline-flex items-center gap-1 font-medium hover:underline'
      >
        {t('Open Promoter Center')}
        <ArrowRight className='size-3.5' aria-hidden='true' />
      </Link>
    </div>
  )
}
