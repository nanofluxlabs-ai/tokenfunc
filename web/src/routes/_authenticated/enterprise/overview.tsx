import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseOverview } from '@/features/enterprise-console'

export const Route = createFileRoute('/_authenticated/enterprise/overview')({
  component: EnterpriseOverview,
})
