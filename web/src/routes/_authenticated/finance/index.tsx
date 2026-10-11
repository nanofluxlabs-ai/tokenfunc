import { createFileRoute, redirect } from '@tanstack/react-router'

import { FINANCE_DEFAULT_SECTION } from '@/features/finance/section-registry'

export const Route = createFileRoute('/_authenticated/finance/')({
  beforeLoad: () => {
    throw redirect({
      to: '/finance/$section',
      params: { section: FINANCE_DEFAULT_SECTION },
    })
  },
})
