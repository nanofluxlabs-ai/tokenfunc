import { describe, expect, it } from 'vitest'

import { FAQ_ITEMS } from '../content'
import { pickLandingFaq } from '../lib/landing-faq'

const consoleItems = [
  { id: 1, question: '怎么充值？', answer: '在钱包页充值。' },
  { id: 2, question: '  ', answer: '空问题会被丢掉' },
]

describe('pickLandingFaq', () => {
  it('uses the console FAQ for Chinese interfaces when it has entries', () => {
    for (const language of ['zhCN', 'zhTW']) {
      const faq = pickLandingFaq({ language, enabled: true, consoleItems })
      expect(faq.source).toBe('console')
      expect(faq.items.map((item) => item.question)).toEqual(['怎么充值？'])
    }
  })

  it('uses the built-in FAQ for every non-Chinese interface', () => {
    for (const language of ['en', 'fr', 'ru', 'ja', 'vi']) {
      const faq = pickLandingFaq({ language, enabled: true, consoleItems })
      expect(faq).toEqual({ source: 'builtin', items: FAQ_ITEMS })
    }
  })

  it('falls back to the built-in FAQ when the console FAQ is empty, disabled or malformed', () => {
    const cases = [
      { enabled: true, consoleItems: [] },
      { enabled: true, consoleItems: undefined },
      { enabled: false, consoleItems },
      { enabled: true, consoleItems: 'not-a-list' },
      { enabled: true, consoleItems: [{ question: 'no answer' }] },
    ]
    for (const input of cases) {
      expect(pickLandingFaq({ language: 'zhCN', ...input }).source).toBe(
        'builtin'
      )
    }
  })
})
