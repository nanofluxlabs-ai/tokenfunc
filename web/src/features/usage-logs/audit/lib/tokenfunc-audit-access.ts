import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { enterpriseSelfQueryOptions } from '@/features/enterprise-console/hooks/use-enterprise-self'
import { actorAtLeast } from '@/features/enterprise-console/lib/member-roles'
import type { EnterpriseActor } from '@/features/enterprise-console/types'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

/** 审计日志入口（TokenFunc）：平台管理员，或企业主账号 / 企业管理员（看本企业）；个人用户与团队角色不展示 */
export function canSeeAuditMenu(
  role: number | undefined,
  actor: EnterpriseActor | null | undefined
): boolean {
  return (role ?? ROLE.GUEST) >= ROLE.ADMIN || canReadEnterpriseAudit(actor)
}

/** 企业审计视角：企业主账号与企业管理员 */
export function canReadEnterpriseAudit(
  actor: EnterpriseActor | null | undefined
): boolean {
  return actorAtLeast(actor, 'enterprise_admin')
}

/** 审计页路由守卫：没有入口的身份直达时转到使用日志；企业资料查询失败按无入口处理 */
export async function redirectWithoutAuditAccess(
  queryClient: QueryClient
): Promise<void> {
  const user = useAuthStore.getState().auth.user
  if (!user || user.role >= ROLE.ADMIN) return
  const self = await queryClient
    .ensureQueryData(enterpriseSelfQueryOptions(user.id))
    .catch(() => null)
  if (canReadEnterpriseAudit(self?.actor)) return
  throw redirect({
    to: '/usage-logs/$section',
    params: { section: 'common' },
    replace: true,
  })
}
