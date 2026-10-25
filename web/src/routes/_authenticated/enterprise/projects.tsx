import { createFileRoute, redirect } from '@tanstack/react-router'

// 项目已并入团队模型；旧链接统一跳到团队页
export const Route = createFileRoute('/_authenticated/enterprise/projects')({
  beforeLoad: () => {
    throw redirect({ to: '/enterprise/teams', replace: true })
  },
})
