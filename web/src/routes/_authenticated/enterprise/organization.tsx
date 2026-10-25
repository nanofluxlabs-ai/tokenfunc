import { createFileRoute, redirect } from '@tanstack/react-router'

// 组织架构页已并入团队页；旧链接统一跳到 /enterprise/teams
export const Route = createFileRoute('/_authenticated/enterprise/organization')(
  {
    beforeLoad: () => {
      throw redirect({ to: '/enterprise/teams', replace: true })
    },
  }
)
