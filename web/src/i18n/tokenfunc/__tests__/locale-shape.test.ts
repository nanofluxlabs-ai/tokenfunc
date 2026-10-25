import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

// 二开翻译文件只允许一个顶层键 translation；写到顶层的 key 不会被 withTokenfunc 合并，界面会直接显示英文 key
const localesDir = join(__dirname, '..', '..', 'locales', 'tokenfunc')
const localeFiles = readdirSync(localesDir).filter((name) =>
  name.endsWith('.json')
)

describe('tokenfunc locale files', () => {
  test('every locale file has translation as its only top-level key', () => {
    for (const name of localeFiles) {
      const parsed = JSON.parse(
        readFileSync(join(localesDir, name), 'utf8')
      ) as Record<string, unknown>
      expect(Object.keys(parsed), name).toEqual(['translation'])
    }
  })

  test('every locale file carries the same key set as en.json', () => {
    const keysOf = (name: string) =>
      Object.keys(
        (
          JSON.parse(readFileSync(join(localesDir, name), 'utf8')) as {
            translation: Record<string, string>
          }
        ).translation
      ).sort()
    const base = keysOf('en.json')
    for (const name of localeFiles) {
      expect(keysOf(name), name).toEqual(base)
    }
  })
})
