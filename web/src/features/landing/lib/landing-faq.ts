import { FAQ_ITEMS } from '../content'

export type LandingFaqItem = { question: string; answer: string }

export type LandingFaq = {
  /** console：后台「常见问答」原文；builtin：内置默认问答（i18n key，需经 t()） */
  source: 'console' | 'builtin'
  items: LandingFaqItem[]
}

const CHINESE_LANGUAGES = new Set(['zhCN', 'zhTW'])

function isFaqItem(value: unknown): value is LandingFaqItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.question === 'string' &&
    item.question.trim() !== '' &&
    typeof item.answer === 'string' &&
    item.answer.trim() !== ''
  )
}

/**
 * 落地页 FAQ 的内容来源：后台「常见问答」只有一种语言（中文），
 * 所以只有中文界面且后台已开启、非空时用后台内容，其余情况用内置的多语言默认问答。
 */
export function pickLandingFaq(input: {
  language: string
  enabled: unknown
  consoleItems: unknown
}): LandingFaq {
  if (
    CHINESE_LANGUAGES.has(input.language) &&
    input.enabled !== false &&
    Array.isArray(input.consoleItems)
  ) {
    const items = input.consoleItems.filter(isFaqItem)
    if (items.length > 0) return { source: 'console', items }
  }
  return { source: 'builtin', items: FAQ_ITEMS }
}
