import dayjs from '@/lib/dayjs'

import type { PromoterCenterUser } from '../types'

/** 口径文案：usage_since = 0 为全历史，否则从该上海日起 */
export function describeUsageScope(
  user: Pick<PromoterCenterUser, 'usage_since'>,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!user.usage_since) return t('All history')
  return t('Since {{day}}', {
    day: dayjs(user.usage_since * 1000).format('YYYY-MM-DD'),
  })
}
