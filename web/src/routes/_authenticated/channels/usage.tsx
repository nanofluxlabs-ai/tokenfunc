import { createFileRoute, redirect } from '@tanstack/react-router'

import { ChannelUsagePage } from '@/features/channel-usage'
import { channelUsageSearchSchema } from '@/features/channel-usage/search-schema'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/channels/usage')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  validateSearch: channelUsageSearchSchema,
  component: ChannelUsagePage,
})
