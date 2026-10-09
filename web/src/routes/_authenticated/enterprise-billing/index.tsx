import { createFileRoute, redirect } from '@tanstack/react-router'

import { EnterpriseBillsAdmin } from '@/features/enterprises'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/enterprise-billing/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: EnterpriseBillsAdmin,
})
