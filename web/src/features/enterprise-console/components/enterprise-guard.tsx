import { Building2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'

import { useEnterpriseSelf } from '../hooks/use-enterprise-self'

/** 企业控制台页面守卫：既不是企业主也不是已开通登录的成员时显示提示，不渲染页面内容 */
export function EnterpriseGuard(props: { children: ReactNode }) {
  const { t } = useTranslation()
  const { data, isLoading } = useEnterpriseSelf()
  if (isLoading) return <LoadingState />
  if (!data) {
    return (
      <EmptyState
        icon={Building2}
        title={t('Enterprise account required')}
        description={t(
          'This page is available to enterprise owners and members with console access.'
        )}
      />
    )
  }
  return props.children
}
