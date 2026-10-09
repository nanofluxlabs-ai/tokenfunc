import { createFileRoute } from '@tanstack/react-router'

import { EnterpriseBillDetail } from '@/features/enterprise-console'

export const Route = createFileRoute('/_authenticated/enterprise/bills/$id')({
  component: EnterpriseBillDetail,
})
