import { Megaphone } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'

import { usePromoterSelf } from '../hooks/use-promoter-self'

/** 推广中心自助页守卫：非推广人显示提示，不渲染页面内容 */
export function PromoterGuard(props: { children: ReactNode }) {
  const { t } = useTranslation()
  const { data, isLoading } = usePromoterSelf()
  if (isLoading) return <LoadingState />
  if (!data) {
    return (
      <EmptyState
        icon={Megaphone}
        title={t('Promoter account required')}
        description={t(
          'This page is available to promoter accounts only. Contact the administrator to join the promoter program.'
        )}
      />
    )
  }
  return props.children
}
