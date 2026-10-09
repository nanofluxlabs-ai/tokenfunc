import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseUsage } from '@/features/enterprise-console'

export const Route = createFileRoute('/_authenticated/enterprise/usage')({
  component: EnterpriseUsage,
})
