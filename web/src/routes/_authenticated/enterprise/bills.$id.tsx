import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { getBill } from '@/features/enterprise-console/api'
import { EnterpriseGuard } from '@/features/enterprise-console/components/enterprise-guard'
import { BillDetailView } from '@/features/finance/components/bill-detail/bill-detail-view'
import { requireServerSuccess } from '@/lib/server-error-message'

export const Route = createFileRoute('/_authenticated/enterprise/bills/$id')({
  component: EnterpriseBillDetailRoute,
})

/** 企业控制台的账单详情：后端返回与管理员同构的账单上下文，正文与财务中心共用 */
function EnterpriseBillDetailRoute() {
  const params = Route.useParams()
  const billId = Number(params.id)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['enterprise', 'bills', billId],
    queryFn: async () =>
      requireServerSuccess(await getBill(billId)).data ?? null,
    enabled: Number.isFinite(billId) && billId > 0,
    meta: { errorToast: false },
  })
  return (
    <EnterpriseGuard>
      <BillDetailView
        scope='enterprise'
        context={data}
        isLoading={isLoading}
        notFound={!isLoading && (isError || !data)}
        backLink={<Link to='/enterprise/bills' />}
      />
    </EnterpriseGuard>
  )
}
