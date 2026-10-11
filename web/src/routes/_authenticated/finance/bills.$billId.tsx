import { createFileRoute, redirect } from '@tanstack/react-router'

import { BillDetailPage } from '@/features/finance/components/bill-detail/bill-detail-page'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/finance/bills/$billId')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: BillDetailPage,
})
