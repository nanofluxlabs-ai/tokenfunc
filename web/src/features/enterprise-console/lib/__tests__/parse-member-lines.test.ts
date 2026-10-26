import { describe, expect, it } from 'vitest'

import { parseMemberLines } from '../parse-member-lines'

describe('parseMemberLines', () => {
  it('accepts comma, fullwidth comma, tab and whitespace separated lines', () => {
    const result = parseMemberLines(
      [
        'Alice, alice@example.com, E001, R&D',
        '王五，wangwu@acme.com，E002',
        'Bob\tbob@example.com',
        'Carol carol@example.com E003 QA',
        'QA Two qa.two@example.test',
        'Zhang San zs@example.com E004 Platform Team',
      ].join('\n')
    )
    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      {
        name: 'Alice',
        email: 'alice@example.com',
        employee_no: 'E001',
        team: 'R&D',
      },
      { name: '王五', email: 'wangwu@acme.com', employee_no: 'E002', team: '' },
      { name: 'Bob', email: 'bob@example.com', employee_no: '', team: '' },
      {
        name: 'Carol',
        email: 'carol@example.com',
        employee_no: 'E003',
        team: 'QA',
      },
      {
        name: 'QA Two',
        email: 'qa.two@example.test',
        employee_no: '',
        team: '',
      },
      {
        name: 'Zhang San',
        email: 'zs@example.com',
        employee_no: 'E004',
        team: 'Platform Team',
      },
    ])
  })

  it('skips blank lines but keeps original line numbers in errors', () => {
    const result = parseMemberLines(
      '\nAlice\n\nBob, not-an-email\nDan, d@x.io, 1, T, extra\n'
    )
    expect(result.rows).toEqual([])
    expect(result.errors).toEqual([
      { line: 2, reason: 'missing_email' },
      { line: 4, reason: 'missing_email' },
      { line: 5, reason: 'too_many_fields' },
    ])
  })
})
