import { createFileRoute, redirect } from '@tanstack/react-router'

import { FinanceCenter } from '@/features/finance'
import { financeSectionSearchSchema } from '@/features/finance/search-schema'
import {
  FINANCE_DEFAULT_SECTION,
  isFinanceSectionId,
} from '@/features/finance/section-registry'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/finance/$section')({
  beforeLoad: ({ params }) => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
    if (!isFinanceSectionId(params.section)) {
      throw redirect({
        to: '/finance/$section',
        params: { section: FINANCE_DEFAULT_SECTION },
      })
    }
  },
  validateSearch: financeSectionSearchSchema,
  component: FinanceCenter,
})
