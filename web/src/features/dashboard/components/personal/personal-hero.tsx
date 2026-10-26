import { Link } from '@tanstack/react-router'
import { KeyRound, ReceiptText, RefreshCw, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/stores/auth-store'

import type { PersonalSnapshot } from '../../lib/personal-overview'

type PersonalHeroProps = {
  user: AuthUser | null
  snapshot: PersonalSnapshot
  now: Date
  /** 用量数据已就绪；未就绪时不估算可用天数 */
  usageReady: boolean
  refreshing: boolean
  onRefresh: () => void
}

type BalanceHealth = 'healthy' | 'caution' | 'critical' | 'unknown'

const HEALTH_DOT: Record<BalanceHealth, string> = {
  healthy: 'bg-success',
  caution: 'bg-warning',
  critical: 'bg-destructive',
  unknown: 'bg-muted-foreground/50',
}

/** 余额可用天数低于该值视为偏低，与旧概览页的健康度分档一致 */
const LOW_RUNWAY_DAYS = 3

/** 概览顶部账户卡：问候 + 余额 + 按近 7 日日均估算的可用天数 + 累计用量 + 常用入口 */
export function PersonalHero(props: PersonalHeroProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const balance = Number(props.user?.quota ?? 0)
  const dailyAverage = props.snapshot.dailyAverageQuota
  const hour = props.now.getHours()

  let greeting = t('Good evening')
  if (hour >= 5 && hour < 12) greeting = t('Good morning')
  else if (hour >= 12 && hour < 18) greeting = t('Good afternoon')

  let health: BalanceHealth = 'unknown'
  let runwayText = t('No recent usage')
  if (balance <= 0) {
    health = 'critical'
    runwayText = t('Balance depleted')
  } else if (props.usageReady && dailyAverage > 0) {
    const days = balance / dailyAverage
    health = days < LOW_RUNWAY_DAYS ? 'caution' : 'healthy'
    if (days < 1) {
      runwayText = t('Less than 1 day left')
    } else if (days > 999) {
      runwayText = t('Lasts 999+ days at recent pace')
    } else {
      runwayText = t('Lasts about {{days}} days at recent pace', {
        days: formatNumber(Math.floor(days), locale),
      })
    }
  } else if (props.usageReady) {
    health = 'healthy'
  }

  const name = props.user?.display_name || props.user?.username || ''

  return (
    <Card
      className={cn(
        'relative gap-0 overflow-hidden p-5 sm:p-6',
        'bg-[linear-gradient(135deg,color-mix(in_oklch,var(--chart-1)_10%,var(--card))_0%,var(--card)_55%,color-mix(in_oklch,var(--chart-4)_6%,var(--card))_100%)]'
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <p className='text-muted-foreground min-w-0 text-sm'>
          <span className='text-foreground font-medium'>
            {name
              ? t('{{greeting}}, {{name}}', { greeting, name })
              : greeting}
          </span>
          <span aria-hidden='true'> · </span>
          {t('{{value}} requests today', {
            value: formatNumber(props.snapshot.today.count, locale),
          })}
        </p>
        <Button
          variant='ghost'
          size='icon'
          aria-label={t('Refresh')}
          disabled={props.refreshing}
          onClick={props.onRefresh}
        >
          <RefreshCw
            className={cn('size-4', props.refreshing && 'animate-spin')}
            aria-hidden='true'
          />
        </Button>
      </div>

      <div className='mt-3 flex flex-wrap items-end gap-x-6 gap-y-3'>
        <div>
          <div className='text-muted-foreground text-xs'>
            {t('Available balance')}
          </div>
          <div className='mt-1 font-mono text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl'>
            {formatQuotaWithCurrency(balance)}
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2 pb-1'>
          <span className='bg-background/70 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs'>
            <span
              className={cn('size-1.5 rounded-full', HEALTH_DOT[health])}
              aria-hidden='true'
            />
            {runwayText}
          </span>
          {props.user?.group && (
            <span className='bg-background/70 text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-1 text-xs'>
              {t('Group')}: {props.user.group}
            </span>
          )}
        </div>
      </div>

      <div className='text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs'>
        <span>
          {t('Lifetime spend')}{' '}
          <span className='text-foreground font-mono'>
            {formatQuotaWithCurrency(Number(props.user?.used_quota ?? 0))}
          </span>
        </span>
        <span>
          {t('Lifetime requests')}{' '}
          <span className='text-foreground font-mono'>
            {formatNumber(Number(props.user?.request_count ?? 0), locale)}
          </span>
        </span>
        <span>{t('Usage data may lag by up to 5 minutes')}</span>
      </div>

      <div className='mt-5 flex flex-wrap gap-2'>
        <Button render={<Link to='/wallet' />}>
          <Wallet className='size-4' aria-hidden='true' />
          {t('Recharge')}
        </Button>
        <Button variant='outline' render={<Link to='/usage-logs' />}>
          <ReceiptText className='size-4' aria-hidden='true' />
          {t('Usage Logs')}
        </Button>
        <Button variant='outline' render={<Link to='/keys' />}>
          <KeyRound className='size-4' aria-hidden='true' />
          {t('API Keys')}
        </Button>
      </div>
    </Card>
  )
}
