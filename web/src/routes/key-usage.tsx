import { createFileRoute } from '@tanstack/react-router'

import { KeyUsagePage } from '@/features/key-usage'
import { keyUsageSearchSchema } from '@/features/key-usage/search-schema'

// TokenFunc 二开：公开的 API 密钥用量查询页，不需要登录
export const Route = createFileRoute('/key-usage')({
  validateSearch: keyUsageSearchSchema,
  component: KeyUsagePage,
})
