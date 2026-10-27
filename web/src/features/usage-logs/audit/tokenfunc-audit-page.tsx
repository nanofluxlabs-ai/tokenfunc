import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ENTERPRISE_SELF_QUERY_KEY,
  useEnterpriseSelf,
} from '@/features/enterprise-console/hooks/use-enterprise-self'
import { getUserProfile } from '@/features/profile/api'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import type { AuditScope } from './api'
import { AuditLogViewer } from './components/audit-log-viewer'
import { canReadEnterpriseAudit } from './lib/tokenfunc-audit-access'

/**
 * 审计日志页（TokenFunc）：在上游页面（./index.tsx）的「全部 / 仅我的」之外，
 * 给企业主账号与企业管理员加「本企业」视角；外部视角隐藏请求方法与路由列。
 */
export function TokenfuncAuditLogs() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const queryClient = useQueryClient()
  const enterprise = useEnterpriseSelf().data
  const isPlatformAdmin = !!user && user.role >= ROLE.ADMIN
  const canReadAll =
    isPlatformAdmin &&
    hasPermission(
      user,
      ADMIN_PERMISSION_RESOURCES.AUDIT,
      ADMIN_PERMISSION_ACTIONS.READ
    )
  const canReadEnterprise =
    !isPlatformAdmin && canReadEnterpriseAudit(enterprise?.actor)
  const wideScope: AuditScope | null =
    (canReadAll && 'all') || (canReadEnterprise && 'enterprise') || null
  const [selected, setSelected] = useState<'wide' | 'self'>('wide')
  const [accessRevoked, setAccessRevoked] = useState(false)
  const effectiveScope: AuditScope =
    wideScope && !accessRevoked && selected === 'wide' ? wideScope : 'self'
  const userId = user?.id

  const handleAccessDenied = useCallback(async () => {
    setAccessRevoked(true)
    setSelected('self')
    const current = useAuthStore.getState().auth.user
    if (wideScope === 'all' && current && current.id === userId) {
      useAuthStore.getState().auth.setUser({
        ...current,
        permissions: {
          ...current.permissions,
          admin_permissions: {
            ...current.permissions?.admin_permissions,
            audit: { read: false },
          },
        },
      })
    }
    await queryClient.cancelQueries({ queryKey: ['audit', userId] })
    queryClient.removeQueries({ queryKey: ['audit', userId, 'all'] })
    queryClient.removeQueries({ queryKey: ['audit', userId, 'enterprise'] })
    void queryClient.invalidateQueries({ queryKey: ENTERPRISE_SELF_QUERY_KEY })
    try {
      const profile = await getUserProfile()
      const latest = useAuthStore.getState().auth.user
      if (
        profile.success &&
        profile.data &&
        latest &&
        profile.data.id === userId &&
        latest.id === userId
      ) {
        useAuthStore.getState().auth.setUser({
          ...latest,
          role: profile.data.role,
          permissions: profile.data.permissions,
        })
      }
    } catch {
      // Keep the denied scope closed when refreshing capabilities fails.
    }
  }, [queryClient, userId, wideScope])

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Audit Logs')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        {wideScope && !accessRevoked && (
          <Tabs
            value={selected}
            onValueChange={(value) =>
              setSelected(value === 'wide' ? 'wide' : 'self')
            }
          >
            <TabsList aria-label={t('View scope')}>
              <TabsTrigger value='wide'>
                {wideScope === 'all' ? t('All') : t('This enterprise')}
              </TabsTrigger>
              <TabsTrigger value='self'>{t('Only Mine')}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col gap-3'>
          {accessRevoked && (
            <p role='status' className='text-muted-foreground shrink-0 text-xs'>
              {t('Audit access changed. Showing only your records.')}
            </p>
          )}
          <div className='min-h-0 flex-1'>
            <AuditLogViewer
              key={`${userId}:${effectiveScope}`}
              scope={effectiveScope}
              showUsername={effectiveScope !== 'self'}
              hideRequestRoute={!isPlatformAdmin}
              onAccessDenied={handleAccessDenied}
            />
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
