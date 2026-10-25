import { createFileRoute } from '@tanstack/react-router'

import { PromoterCenterPage, PromoterGuard } from '@/features/promoter-center'
import { promoterCenterSearchSchema } from '@/features/promoter-center/search-schema'

export const Route = createFileRoute('/_authenticated/promoter-center/')({
  validateSearch: promoterCenterSearchSchema,
  component: PromoterCenterRoute,
})

function PromoterCenterRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <PromoterGuard>
      <PromoterCenterPage
        scope={{ scope: 'self' }}
        search={search}
        navigate={navigate}
      />
    </PromoterGuard>
  )
}
