import { createFileRoute, redirect } from '@tanstack/react-router'

// 企业账单已并入财务中心；保留旧地址做跳转
export const Route = createFileRoute('/_authenticated/enterprise-billing/')({
  beforeLoad: () => {
    throw redirect({
      to: '/finance/$section',
      params: { section: 'enterprise-bills' },
    })
  },
})
