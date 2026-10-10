import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { requireServerSuccess } from '@/lib/server-error-message'

import { listProjects } from '../api'
import type { EntityOption } from '../components/entity-select'

/** key 归属可选的项目（仅进行中项目）；员工改用可搜索的 EmployeePicker */
export function useProjectOptions() {
  const projects = useQuery({
    queryKey: ['enterprise', 'projects', 'options'],
    queryFn: async () =>
      requireServerSuccess(await listProjects({ status: 'active' })).data ?? [],
  })
  return useMemo<EntityOption[]>(
    () =>
      (projects.data ?? []).map((project) => ({
        value: project.id,
        label: project.name,
      })),
    [projects.data]
  )
}
