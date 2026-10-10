import { createFileRoute, redirect } from '@tanstack/react-router'

import { EnterpriseLeadsAdmin } from '@/features/enterprises/components/leads-admin-page'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/enterprise-leads/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: EnterpriseLeadsAdmin,
})
