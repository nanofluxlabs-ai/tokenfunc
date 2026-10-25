export const PROMOTERS_QUERY_KEY = 'admin-promoters'

/** 与后端 service.PromoterBatchBindMax 一致 */
export const PROMOTER_BATCH_BIND_MAX = 200

export const ERROR_MESSAGES = {
  LOAD_FAILED: 'Failed to load promoters',
} as const

/** 添加 / 编辑推广人表单的初始值 */
export const EMPTY_PROMOTER_FIELDS = { remark: '', share_rate: 0 } as const
