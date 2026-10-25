import { describe, expect, test } from 'vitest'

import { parseCsv, parseMemberCsv } from '../parse-member-csv'

describe('parseCsv', () => {
  test('handles quoted commas, escaped quotes, CRLF and BOM', () => {
    const text = '﻿a,b\r\n"x, y","say ""hi"""\r\n'
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ])
  })

  test('drops blank lines', () => {
    expect(parseCsv('a,b\n\n ,\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('parseMemberCsv', () => {
  test('maps Chinese headers in any order and trims cells', () => {
    const result = parseMemberCsv('团队,姓名,工号\n 研发 , 张三 ,E1\n')
    expect(result.error).toBeUndefined()
    expect(result.rows).toEqual([
      { name: '张三', email: '', employee_no: 'E1', team: '研发' },
    ])
  })

  test('accepts the legacy department column as team', () => {
    const result = parseMemberCsv('name,department\nAlice,R&D')
    expect(result.rows).toEqual([
      { name: 'Alice', email: '', employee_no: '', team: 'R&D' },
    ])
  })

  test('reports a missing name column', () => {
    expect(parseMemberCsv('email,team\na@b.c,R&D').error).toBe(
      'missing_name_column'
    )
  })

  test('reports an empty file and a header-only file', () => {
    expect(parseMemberCsv('').error).toBe('empty')
    expect(parseMemberCsv('name,email').error).toBe('empty')
  })
})
