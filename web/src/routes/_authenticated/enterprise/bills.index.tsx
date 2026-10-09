import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseBills } from '@/features/enterprise-console'

export const Route = createFileRoute('/_authenticated/enterprise/bills/')({
  component: EnterpriseBills,
})
