import { describe, expect, test } from 'vitest'

import { parseCsv, parseEmployeeCsv } from '../parse-employee-csv'

describe('parseCsv', () => {
  test('handles quoted commas, escaped quotes, CRLF and BOM', () => {
    const text = '\ufeffa,b\r\n"x, y","say ""hi"""\r\n'
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

describe('parseEmployeeCsv', () => {
  test('maps Chinese headers in any order and trims cells', () => {
    const result = parseEmployeeCsv('部门,姓名,工号\n 研发 , 张三 ,E1\n')
    expect(result.error).toBeUndefined()
    expect(result.rows).toEqual([
      { name: '张三', email: '', employee_no: 'E1', department: '研发' },
    ])
  })

  test('reports a missing name column', () => {
    expect(parseEmployeeCsv('email,department\na@b.c,R&D').error).toBe(
      'missing_name_column'
    )
  })

  test('reports an empty file and a header-only file', () => {
    expect(parseEmployeeCsv('').error).toBe('empty')
    expect(parseEmployeeCsv('name,email').error).toBe('empty')
  })
})
