import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { requireServerSuccess } from '@/lib/server-error-message'

import { listEmployees, listProjects } from '../api'
import type { EntityOption } from '../components/entity-select'

/**
 * key 归属可选的员工与项目（仅在职员工、进行中项目）。
 * 员工最多取 100 条（后端分页上限），超大企业后续改为可搜索选择器。
 */
export function useAssignmentOptions() {
  const employees = useQuery({
    queryKey: ['enterprise', 'employees', 'options'],
    queryFn: async () =>
      requireServerSuccess(
        await listEmployees({ status: 'active', page_size: 100 })
      ).data?.items ?? [],
  })
  const projects = useQuery({
    queryKey: ['enterprise', 'projects', 'options'],
    queryFn: async () =>
      requireServerSuccess(await listProjects({ status: 'active' })).data ?? [],
  })
  const employeeOptions = useMemo<EntityOption[]>(
    () =>
      (employees.data ?? []).map((employee) => ({
        value: employee.id,
        label: employee.department_name
          ? `${employee.name}（${employee.department_name}）`
          : employee.name,
      })),
    [employees.data]
  )
  const projectOptions = useMemo<EntityOption[]>(
    () =>
      (projects.data ?? []).map((project) => ({
        value: project.id,
        label: project.name,
      })),
    [projects.data]
  )
  return { employeeOptions, projectOptions }
}
