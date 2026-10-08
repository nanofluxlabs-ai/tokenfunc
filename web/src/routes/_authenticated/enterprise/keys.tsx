import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseKeys } from '@/features/enterprise-console'

export const Route = createFileRoute('/_authenticated/enterprise/keys')({
  component: EnterpriseKeys,
})
