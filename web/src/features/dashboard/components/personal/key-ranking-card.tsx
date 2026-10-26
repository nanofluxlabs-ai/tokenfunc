import { lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import type { PersonalKeyRank } from '../../lib/personal-overview'

const UsageRankChart = lazy(() =>
  import('@/features/enterprise-console/components/usage-charts').then(
    (m) => ({ default: m.UsageRankChart })
  )
)

type KeyRankingCardProps = {
  /** 已按消耗倒序 */
  keys: PersonalKeyRank[]
  loading: boolean
}

/** 区间内各 API 密钥的消耗排行，用来发现哪把密钥在烧钱 */
export function KeyRankingCard(props: KeyRankingCardProps) {
  const { t } = useTranslation()
  const slices = useMemo(() => {
    const nameCount = new Map<string, number>()
    for (const key of props.keys) {
      nameCount.set(key.name, (nameCount.get(key.name) ?? 0) + 1)
    }
    // 条形图按名称分类，重名密钥会被合成一根，重名时补上 ID 区分
    return props.keys.map((key) => {
      let name = key.name
      if (!name) name = t('Deleted key #{{id}}', { id: key.tokenId })
      else if ((nameCount.get(name) ?? 0) > 1) name = `${name} #${key.tokenId}`
      return { name, quota: key.quota }
    })
  }, [props.keys, t])

  return (
    <Card className='h-full min-w-0'>
      <CardHeader>
        <CardTitle>{t('Spend by API key')}</CardTitle>
        <CardDescription>{t('Top keys by spend in this range')}</CardDescription>
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <Skeleton className='h-52' />
        ) : (
          <Suspense fallback={<Skeleton className='h-52' />}>
            <UsageRankChart id='personal-key-ranking' data={slices} />
          </Suspense>
        )}
      </CardContent>
    </Card>
  )
}
