import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'

import { PromoterCenterPage } from '@/features/promoter-center'
import { promoterCenterSearchSchema } from '@/features/promoter-center/search-schema'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/promoters/$id/center')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  validateSearch: promoterCenterSearchSchema,
  component: AdminPromoterCenterRoute,
})

/** 管理员视角的推广中心：与自助页同一组件，只是 scope 带推广人 id */
function AdminPromoterCenterRoute() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const goBack = () => {
    if (router.history.length > 1) {
      router.history.back()
      return
    }
    void navigate({ to: '/promoters' })
  }
  return (
    <PromoterCenterPage
      scope={{ scope: 'admin', promoterId: Number(params.id) }}
      search={search}
      navigate={navigate}
      onBack={goBack}
    />
  )
}
