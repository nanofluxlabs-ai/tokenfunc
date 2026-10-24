import { describe, expect, test } from 'vitest'

import { parseBatchInputs } from '../lib/batch-inputs'

describe('parseBatchInputs', () => {
  test('splits by newline, comma and semicolon, trims and drops empty lines', () => {
    expect(parseBatchInputs(' alice \n\n1024,bob;carol；dave，\n')).toEqual([
      'alice',
      '1024',
      'bob',
      'carol',
      'dave',
    ])
  })

  test('keeps the first occurrence when the same entry repeats', () => {
    expect(parseBatchInputs('alice\n1024\nalice\n1024')).toEqual([
      'alice',
      '1024',
    ])
  })

  test('returns an empty list for blank text', () => {
    expect(parseBatchInputs('  \n \n')).toEqual([])
  })
})
