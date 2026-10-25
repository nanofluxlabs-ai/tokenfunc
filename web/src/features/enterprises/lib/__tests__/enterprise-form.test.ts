import type { TFunction } from 'i18next'
import { describe, expect, test } from 'vitest'

import type { Enterprise } from '../../types'
import {
  ENTERPRISE_FORM_DEFAULT_VALUES,
  type EnterpriseFormValues,
  enterpriseToFormValues,
  formValuesToCreatePayload,
  formValuesToProfilePayload,
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

  test('max keys outside 0..10000 is rejected in update mode', () => {
    const base = { ...ENTERPRISE_FORM_DEFAULT_VALUES, name: 'Acme' }
    expect(errorPaths({ ...base, max_tokens: 10001 }, true)).toEqual([
      'max_tokens',
    ])
    expect(errorPaths({ ...base, max_tokens: -1 }, true)).toEqual([
      'max_tokens',
    ])
    expect(errorPaths({ ...base, max_tokens: 0 }, true)).toEqual([])
  })

  test('profile payload carries max keys and an existing enterprise fills the form with its limit', () => {
    const values = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      name: 'Acme',
      max_tokens: 50,
    }
    expect(formValuesToProfilePayload(values).max_tokens).toBe(50)

    const enterprise: Enterprise = {
      id: 1,
      user_id: 2,
      name: 'Acme',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      billing_mode: 'prepaid',
      credit_cycle_type: '',
      credit_cycle_days: 0,
      credit_limit_quota: 0,
      credit_auto_reset: false,
      credit_alert_percent: 80,
      payment_terms_days: 15,
      currency: 'USD',
      billing_profile: {
        company_name: '',
        address: '',
        tax_id: '',
        billing_email: '',
        phone: '',
        country: '',
      },
      status: 'active',
      remark: '',
      max_tokens: 300,
      created_at: 0,
      updated_at: 0,
    }
    expect(enterpriseToFormValues(enterprise).max_tokens).toBe(300)
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
