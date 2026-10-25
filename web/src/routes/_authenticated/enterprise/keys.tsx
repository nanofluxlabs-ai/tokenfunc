import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseKeys } from '@/features/enterprise-console'
import { enterpriseKeysSearchSchema } from '@/features/enterprise-console/search-schema'

export const Route = createFileRoute('/_authenticated/enterprise/keys')({
  validateSearch: enterpriseKeysSearchSchema,
  component: EnterpriseKeys,
})
