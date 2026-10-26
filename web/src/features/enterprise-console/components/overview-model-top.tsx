import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getUsageSummary } from '../api'
import { buildUsageColumns } from '../lib/usage-columns'
import { usageRangeFromPreset } from '../lib/usage-range'

const TOP_COUNT = 5

type OverviewModelTopProps = {
  /** 服务端口径的今天（YYYY-MM-DD），取自 overview.daily 末项 */
  today: string
}

/** 概览今日模型消耗 Top5：占比分母是今日全部模型；与用量报表的模型查询共用缓存 */
export function OverviewModelTop(props: OverviewModelTopProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  // queryKey 与 UsagePanel 的模型查询同形，下钻到报表今日区间时直接命中缓存
  const models = useQuery({
    queryKey: [
      'enterprise',
      'usage',
      'model',
      props.today,
      props.today,
      undefined,
      undefined,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUsageSummary({
          group_by: 'model',
          from: props.today,
          to: props.today,
        })
      ).data?.items ?? [],
    enabled: props.today !== '',
  })
  const items = useMemo(() => models.data ?? [], [models.data])
  const totalQuota = items.reduce((total, item) => total + item.quota, 0)
  const columns = buildUsageColumns<(typeof items)[number]>({
    t,
    locale,
    nameHeader: t('Model'),
    nameCell: (row) => (
      <span className='font-mono text-xs'>{row.key_name || '-'}</span>
    ),
    totalQuota,
    cache: 'hit',
  })
  const weekRange = usageRangeFromPreset('7d', props.today)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Today's top models")}</CardTitle>
        <CardDescription>
          {t('Top {{count}} models by cost today', { count: TOP_COUNT })}
        </CardDescription>
        <CardAction>
          <Link
            to='/enterprise/usage'
            search={{ from: props.today, to: props.today, group_by: 'model' }}
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs'
          >
            {t('View all')}
            <ArrowRight className='size-3' aria-hidden='true' />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <StaticDataTable
          columns={columns}
          data={items.slice(0, TOP_COUNT)}
          getRowKey={(row) => row.key_name}
          empty={!models.isLoading && items.length === 0}
          emptyContent={
            <div className='flex flex-col items-center gap-1'>
              <span>{t('No model calls today')}</span>
              <Link
                to='/enterprise/usage'
                search={{ ...weekRange, group_by: 'model' }}
                className='text-xs underline-offset-4 hover:underline'
              >
                {t('View the last 7 days')}
              </Link>
            </div>
          }
        />
      </CardContent>
    </Card>
  )
}
