import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseOrganization } from '@/features/enterprise-console'

export const Route = createFileRoute('/_authenticated/enterprise/organization')(
  {
    component: EnterpriseOrganization,
  }
)
