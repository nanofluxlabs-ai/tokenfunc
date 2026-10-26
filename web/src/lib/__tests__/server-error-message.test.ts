import i18next from 'i18next'
import { afterEach, describe, expect, it } from 'vitest'

import {
  getServerErrorMessage,
  getServerMessage,
} from '../server-error-message'

describe('server messages without message_key', () => {
  afterEach(async () => {
    await i18next.changeLanguage('en')
  })

  it('translates the English source text when the locale has it', async () => {
    i18next.addResourceBundle('zhCN', 'translation', {
      'member is disabled': '该成员已被禁用',
    })
    await i18next.changeLanguage('zhCN')
    const response = { success: false, message: 'member is disabled' }
    expect(getServerMessage(response)).toBe('该成员已被禁用')
    expect(getServerErrorMessage(response)).toBe('该成员已被禁用')
  })

  it('returns unknown text unchanged, without interpolation', () => {
    const response = {
      success: false,
      message: 'upstream said {{weird}}: keep it',
    }
    expect(getServerMessage(response)).toBe('upstream said {{weird}}: keep it')
  })
})
