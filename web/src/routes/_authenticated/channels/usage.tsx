import { createFileRoute, redirect } from '@tanstack/react-router'

import { ChannelUsagePage } from '@/features/channel-usage'
import { channelUsageSearchSchema } from '@/features/channel-usage/search-schema'
import { ROLE } from '@/lib/roles'
import { canAccessRoute } from '@/lib/tokenfunc-route-permissions'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/channels/usage')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
    // TokenFunc 二开：没有 channel.read 不进页面，免得一加载就请求被拒、弹「权限不足」
    if (!canAccessRoute(auth.user, '/channels/usage')) {
      throw redirect({ to: '/403' })
    }
  },
  validateSearch: channelUsageSearchSchema,
  component: ChannelUsagePage,
})
