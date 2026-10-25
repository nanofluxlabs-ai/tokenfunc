import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { requireServerSuccess } from '@/lib/server-error-message'

import { listTeams } from '../api'
import type { EntityOption } from '../components/entity-select'
import type { Team } from '../types'

/** 当前身份可见的团队列表（团队角色只会拿到自己的团队） */
export function useTeams() {
  return useQuery({
    queryKey: ['enterprise', 'teams'],
    queryFn: async () =>
      requireServerSuccess(await listTeams()).data ?? ([] as Team[]),
  })
}

/** key / 成员归属可选的团队（仅未归档团队） */
export function useTeamOptions() {
  const teams = useTeams()
  return useMemo<EntityOption[]>(
    () =>
      (teams.data ?? [])
        .filter((team) => team.status === 'active')
        .map((team) => ({ value: team.id, label: team.name })),
    [teams.data]
  )
}
