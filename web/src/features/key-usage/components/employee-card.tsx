import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatQuota } from '@/lib/format'

import type { KeyEmployeeInfo } from '../types'

type EmployeeCardProps = {
  info: KeyEmployeeInfo
}

/** 企业成员 key 的归属与今日 / 本月用量；不含企业余额 */
export function EmployeeCard(props: EmployeeCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const info = props.info
  const periods = [
    { key: 'today', label: t('Today'), value: info.usage.today },
    { key: 'month', label: t('Current month'), value: info.usage.month },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex flex-wrap items-center gap-2'>
          {info.enterprise.name}
          <span className='text-muted-foreground text-sm font-normal'>
            {info.team.name}
            {info.member &&
              ` · ${info.member.name}${info.member.employee_no ? ` (${info.member.employee_no})` : ''}`}
          </span>
          {info.team.budget_state === 'warn' && (
            <StatusBadge
              label={t('Budget warning')}
              variant='warning'
              copyable={false}
            />
          )}
          {info.team.budget_state === 'exceeded' && (
            <StatusBadge
              label={t('Over budget')}
              variant='danger'
              copyable={false}
            />
          )}
        </CardTitle>
        <CardDescription>
          {t('Usage of this key within the enterprise account')}
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4 sm:grid-cols-3'>
        {periods.map((period) => (
          <div key={period.key} className='flex flex-col gap-1'>
            <span className='text-muted-foreground text-sm'>
              {period.label}
            </span>
            <span className='text-lg font-semibold tabular-nums'>
              {formatQuota(period.value.quota)}
            </span>
            <span className='text-muted-foreground text-xs tabular-nums'>
              {t('Requests')} {formatNumber(period.value.requests, locale)}
            </span>
          </div>
        ))}
        <div className='flex flex-col gap-1'>
          <span className='text-muted-foreground text-sm'>
            {t('Top models this month')}
          </span>
          {info.top_models.length === 0 ? (
            <span className='text-muted-foreground text-sm'>-</span>
          ) : (
            <ul className='flex flex-col gap-0.5 text-sm'>
              {info.top_models.map((item) => (
                <li
                  key={item.model}
                  className='flex justify-between gap-2 tabular-nums'
                >
                  <span className='truncate font-mono text-xs'>
                    {item.model}
                  </span>
                  <span>{formatQuota(item.quota)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
