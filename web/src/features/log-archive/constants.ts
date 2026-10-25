import type { StatusBadgeProps } from '@/components/status-badge'

import type { LogArchiveStatusValue } from './types'

export const LOG_ARCHIVE_QUERY_KEY = 'admin-log-archive'

export const LOG_ARCHIVE_PAGE_SIZE = 30

export const LOG_ARCHIVE_STATUS_TAGS: Record<
  LogArchiveStatusValue,
  { labelKey: string; variant: StatusBadgeProps['variant'] }
> = {
  pending: { labelKey: 'Pending', variant: 'warning' },
  verified: { labelKey: 'Uploaded', variant: 'info' },
  purged: { labelKey: 'Purged', variant: 'success' },
}
