import { createFileRoute } from '@tanstack/react-router'

import { ReconciliationPage } from '@/features/reconciliation'
import { reconciliationSearchSchema } from '@/features/reconciliation/search-schema'

export const Route = createFileRoute('/_authenticated/reconciliation/')({
  validateSearch: reconciliationSearchSchema,
  component: ReconciliationPage,
})
