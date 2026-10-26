import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { UsageDayItem } from '../types'
import { type UsageMetric, UsageMetricTabs, UsageTrend } from './usage-trend'

type OverviewTrendCardProps = {
  /** 近 7 天（升序，含今日） */
  days: UsageDayItem[]
  loading: boolean
}

/** 概览近 7 天趋势：指标切换；更长区间去用量报表（默认本月） */
export function OverviewTrendCard(props: OverviewTrendCardProps) {
  const { t } = useTranslation()
  const [metric, setMetric] = useState<UsageMetric>('quota')
  return (
    <Card className='h-full'>
      <CardHeader>
        <CardTitle>{t('Last 7 days trend')}</CardTitle>
        <CardDescription>
          {t('Daily cost, tokens and requests')}
        </CardDescription>
        <CardAction>
          <UsageMetricTabs value={metric} onChange={setMetric} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <UsageTrend
          id='enterprise-overview-trend'
          days={props.days}
          metric={metric}
          loading={props.loading}
          footer={
            <Link
              to='/enterprise/usage'
              search={{}}
              className='hover:text-foreground inline-flex items-center gap-1'
            >
              {t('View longer range')}
              <ArrowRight className='size-3' aria-hidden='true' />
            </Link>
          }
        />
      </CardContent>
    </Card>
  )
}
