import { createFileRoute, redirect } from '@tanstack/react-router'

import { UserConsumptionDetailPage } from '@/features/finance/components/user-detail/user-consumption-detail-page'
import { financeUserSearchSchema } from '@/features/finance/search-schema'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/finance/users/$userId')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  validateSearch: financeUserSearchSchema,
  component: UserConsumptionDetailPage,
})
