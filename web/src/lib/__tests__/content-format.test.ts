import { describe, expect, it } from 'vitest'

import { resolveLocalizedDocument } from '../content-format'

const DOCUMENT = {
  'zh-CN': '# 服务条款\n\n中文正文',
  en: '# Terms of Service\n\nEnglish body',
}

describe('resolveLocalizedDocument', () => {
  it.each([
    { language: 'zhCN', expected: DOCUMENT['zh-CN'] },
    { language: 'zh-CN', expected: DOCUMENT['zh-CN'] },
    { language: 'zhTW', expected: DOCUMENT['zh-CN'] },
    { language: 'en', expected: DOCUMENT.en },
    { language: 'fr', expected: DOCUMENT.en },
    { language: 'ru', expected: DOCUMENT.en },
    { language: 'ja', expected: DOCUMENT.en },
    { language: 'vi', expected: DOCUMENT.en },
    { language: 'xx-INVALID', expected: DOCUMENT.en },
  ])(
    'picks the $language version from a localized JSON document',
    ({ language, expected }) => {
      expect(resolveLocalizedDocument(JSON.stringify(DOCUMENT), language)).toBe(
        expected
      )
    }
  )

  it('returns plain Markdown unchanged when the value is not JSON', () => {
    const markdown = '# Privacy Policy\n\nSingle language body'
    expect(resolveLocalizedDocument(markdown, 'zhCN')).toBe(markdown)
  })

  it('returns a URL unchanged so the caller can still detect it', () => {
    const url = 'https://example.com/terms'
    expect(resolveLocalizedDocument(url, 'en')).toBe(url)
  })

  it('returns the raw value when it starts with { but is not valid JSON', () => {
    const broken = '{ not json'
    expect(resolveLocalizedDocument(broken, 'en')).toBe(broken)
  })

  it('returns the raw value when the JSON object has no non-empty string entries', () => {
    const empty = JSON.stringify({ en: '', 'zh-CN': '   ' })
    expect(resolveLocalizedDocument(empty, 'en')).toBe(empty)
  })

  it('returns the raw value for a JSON array', () => {
    const array = JSON.stringify(['# Terms'])
    expect(resolveLocalizedDocument(array, 'en')).toBe(array)
  })
})
