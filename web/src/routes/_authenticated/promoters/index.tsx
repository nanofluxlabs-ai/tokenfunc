import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

import { PromotersPage } from '@/features/promoters'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const promotersSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(undefined),
  filter: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/promoters/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  validateSearch: promotersSearchSchema,
  component: PromotersPage,
})
