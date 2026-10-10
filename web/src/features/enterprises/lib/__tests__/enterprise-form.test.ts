import type { TFunction } from 'i18next'
import { describe, expect, test } from 'vitest'

import {
  ENTERPRISE_FORM_DEFAULT_VALUES,
  type EnterpriseFormValues,
  formValuesToCreatePayload,
  getEnterpriseFormSchema,
} from '../enterprise-form'

const t = ((key: string) => key) as unknown as TFunction

function errorPaths(values: EnterpriseFormValues, isUpdate: boolean) {
  const result = getEnterpriseFormSchema(t, isUpdate).safeParse(values)
  if (result.success) return []
  return result.error.issues.map((issue) => issue.path.join('.'))
}

describe('enterprise form validation', () => {
  test('new account without username or valid password reports both fields', () => {
    const values = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      name: 'Acme',
      password: 'short',
    }
    expect(errorPaths(values, false)).toEqual(['username', 'password'])
  })

  test('upgrade mode rejects a non-numeric user id and ignores account fields', () => {
    const values = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      mode: 'upgrade' as const,
      name: 'Acme',
      user_id: 'abc',
    }
    expect(errorPaths(values, false)).toEqual(['user_id'])
  })

  test('update mode only validates profile fields', () => {
    const values = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      name: 'Acme',
      billing_email: 'not-an-email',
    }
    expect(errorPaths(values, true)).toEqual(['billing_email'])
  })

  test('upgrade payload sends the numeric user id without credentials', () => {
    const values = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      mode: 'upgrade' as const,
      name: 'Acme',
      user_id: '42',
      username: 'ignored',
    }
    const payload = formValuesToCreatePayload(values)
    expect(payload).toMatchObject({ mode: 'upgrade', user_id: 42 })
    expect(payload).not.toHaveProperty('username')
    expect(payload.enterprise.name).toBe('Acme')
  })
})
