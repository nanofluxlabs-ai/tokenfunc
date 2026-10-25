import type { EnterpriseActor, MemberRole } from '../types'

/** 角色等级：与后端 EnterpriseActor.Rank 一致，owner 视为最高 */
const ROLE_RANK: Record<MemberRole, number> = {
  none: 0,
  developer: 1,
  team_admin: 2,
  enterprise_admin: 3,
}

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  none: 'No login',
  developer: 'Developer',
  team_admin: 'Team admin',
  enterprise_admin: 'Enterprise admin',
}

/** 可通过「登录与角色」授予的角色（none 由解绑完成） */
export const ASSIGNABLE_ROLES: MemberRole[] = [
  'developer',
  'team_admin',
  'enterprise_admin',
]

export function roleRank(role: MemberRole): number {
  return ROLE_RANK[role] ?? 0
}

export function actorAtLeast(
  actor: EnterpriseActor | null | undefined,
  role: MemberRole
): boolean {
  if (!actor) return false
  if (actor.is_owner) return true
  return roleRank(actor.role) >= roleRank(role)
}

/** 团队增删改、预算：企业主 / 企业管理员 */
export function canManageTeams(actor: EnterpriseActor | null | undefined) {
  return actorAtLeast(actor, 'enterprise_admin')
}

/** 成员增删改、导入、登录与角色：团队管理员及以上 */
export function canManageMembers(actor: EnterpriseActor | null | undefined) {
  return actorAtLeast(actor, 'team_admin')
}

/** 当前身份能授予的角色：只能授予不高于自己的角色；team_admin 不能授 enterprise_admin */
export function assignableRolesFor(
  actor: EnterpriseActor | null | undefined
): MemberRole[] {
  if (!actor) return []
  if (actor.is_owner) return ASSIGNABLE_ROLES
  return ASSIGNABLE_ROLES.filter(
    (role) => roleRank(role) <= roleRank(actor.role)
  )
}

/** 团队角色（team_admin / developer）只能看到自己团队 */
export function isTeamScoped(actor: EnterpriseActor | null | undefined) {
  return Boolean(actor) && !actorAtLeast(actor, 'enterprise_admin')
}
