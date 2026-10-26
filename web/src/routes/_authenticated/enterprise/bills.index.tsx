import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseReconciliation } from '@/features/enterprise-console'
import { enterpriseReconciliationSearchSchema } from '@/features/enterprise-console/lib/reconciliation-search'

export const Route = createFileRoute('/_authenticated/enterprise/bills/')({
  validateSearch: enterpriseReconciliationSearchSchema,
  component: EnterpriseReconciliation,
})
