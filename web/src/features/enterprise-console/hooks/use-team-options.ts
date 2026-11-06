import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  const teams = useTeams()
  return useMemo<EntityOption[]>(
    () =>
      (teams.data ?? [])
        .filter((team) => team.status === 'active')
        .map((team) => ({
          value: team.id,
          // 默认团队的库内名字固定是 Default，展示用译文
          label: team.is_default ? t('Default team') : team.name,
        })),
    [teams.data, t]
  )
}

/** 企业默认团队 id；列表未加载时为 0（后端把 0 落到默认团队，语义一致） */
export function useDefaultTeamId() {
  const teams = useTeams()
  return (teams.data ?? []).find((team) => team.is_default)?.id ?? 0
}
