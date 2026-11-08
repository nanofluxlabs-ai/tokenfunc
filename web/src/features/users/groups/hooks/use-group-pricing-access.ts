// TokenFunc 二开：当前登录者对用户分组 / 分组定价的操作权限，决定按钮是否可用、定价是否只读。
// 只做界面提示，真正的校验在后端 group_pricing 权限。
import { hasPermission } from '@/lib/admin-permissions'
import { GROUP_PRICING_PERMISSION } from '@/lib/tokenfunc-groups'
import { useAuthStore } from '@/stores/auth-store'

export function useGroupPricingAccess() {
  const user = useAuthStore((state) => state.auth.user)
  const can = (action: string) =>
    hasPermission(user, GROUP_PRICING_PERMISSION.RESOURCE, action)
  return {
    canRead: can(GROUP_PRICING_PERMISSION.READ),
    canManage: can(GROUP_PRICING_PERMISSION.MANAGE),
    canPrice: can(GROUP_PRICING_PERMISSION.PRICE),
  }
}
