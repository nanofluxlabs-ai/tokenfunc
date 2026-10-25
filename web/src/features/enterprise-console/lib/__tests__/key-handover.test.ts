import { describe, expect, test } from 'vitest'

import { buildKeyHandoverText } from '../key-handover'

describe('buildKeyHandoverText', () => {
  test('greets the holder and lists base url, key and docs on separate lines', () => {
    expect(
      buildKeyHandoverText({
        memberName: 'Alice',
        baseUrl: 'https://api.example.com',
        key: 'sk-abc',
        docsUrl: 'https://api.example.com/docs',
      })
    ).toBe(
      'Hi Alice,\nBase URL: https://api.example.com\nAPI Key: sk-abc\nDocs: https://api.example.com/docs'
    )
  })

  test('omits the greeting for a team key without holder', () => {
    expect(
      buildKeyHandoverText({
        baseUrl: 'https://api.example.com',
        key: 'sk-abc',
        docsUrl: 'https://api.example.com/docs',
      })
    ).toBe(
      'Base URL: https://api.example.com\nAPI Key: sk-abc\nDocs: https://api.example.com/docs'
    )
  })
})
