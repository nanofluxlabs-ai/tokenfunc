import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseTeams } from '@/features/enterprise-console'
import { enterpriseTeamsSearchSchema } from '@/features/enterprise-console/search-schema'

export const Route = createFileRoute('/_authenticated/enterprise/teams')({
  validateSearch: enterpriseTeamsSearchSchema,
  component: EnterpriseTeams,
})
