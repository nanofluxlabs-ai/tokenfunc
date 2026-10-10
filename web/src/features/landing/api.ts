import type { ApiResponse } from '@/features/auth/types'
import { api } from '@/lib/api'

import type { TrialLeadPayload } from './types'

/** 营销页匿名提交企业试用申请 */
export async function submitTrialLead(
  payload: TrialLeadPayload
): Promise<ApiResponse<{ id: number }>> {
  const res = await api.post('/api/enterprise/leads', payload)
  return res.data
}
