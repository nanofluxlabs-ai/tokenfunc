export const CHANNEL_USAGE_QUERY_KEY = 'channel-usage'

export const CHANNEL_USAGE_PAGE_SIZE = 20

/** 展开明细每个维度展示的 Top N */
export const BREAKDOWN_TOP_N = 5

/** 单次明细请求的渠道数上限，与后端 channelBreakdownMaxChannels 对齐 */
export const BREAKDOWN_MAX_IDS_PER_REQUEST = 200

/** 列表可排序的列（接口 sort 参数） */
export const CHANNEL_USAGE_SORT_KEYS = [
  'range_official_quota',
  'month_official_quota',
  'total_official_quota',
] as const

export type ChannelUsageSortKey = (typeof CHANNEL_USAGE_SORT_KEYS)[number]

export const CHANNEL_USAGE_DEFAULT_SORT: ChannelUsageSortKey =
  'range_official_quota'

/** 预付客户按近 7 天日均估算可用天数，低于该值才提示；低于 2 天标红 */
export const RUNWAY_WARN_DAYS = 7
export const RUNWAY_DANGER_DAYS = 2

/** 状态筛选项：value 为接口参数，空串 = 全部 */
export const CHANNEL_USAGE_STATUS_OPTIONS = [
  { value: '', labelKey: 'All Status' },
  { value: '1', labelKey: 'Enabled' },
  { value: '2', labelKey: 'Disabled' },
  { value: '3', labelKey: 'Auto Disabled' },
] as const
