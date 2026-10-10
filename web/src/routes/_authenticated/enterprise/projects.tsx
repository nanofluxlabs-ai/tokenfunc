import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseProjects } from '@/features/enterprise-console'

export const Route = createFileRoute('/_authenticated/enterprise/projects')({
  component: EnterpriseProjects,
})
