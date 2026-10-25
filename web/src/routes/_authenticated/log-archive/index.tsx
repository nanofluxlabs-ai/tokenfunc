import { createFileRoute, redirect } from '@tanstack/react-router'

import { LogArchivePage } from '@/features/log-archive'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/log-archive/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (auth.user?.role !== ROLE.SUPER_ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: LogArchivePage,
})
