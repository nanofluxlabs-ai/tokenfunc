import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseUsage } from '@/features/enterprise-console'
import { enterpriseUsageSearchSchema } from '@/features/enterprise-console/search-schema'

export const Route = createFileRoute('/_authenticated/enterprise/usage')({
  validateSearch: enterpriseUsageSearchSchema,
  component: EnterpriseUsage,
})
