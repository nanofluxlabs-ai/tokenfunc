import type { TFunction } from 'i18next'
import { describe, expect, test } from 'vitest'

import type { Enterprise } from '../../types'
import {
  ENTERPRISE_FORM_DEFAULT_VALUES,
  type EnterpriseFormValues,
  enterpriseToFormValues,
  formValuesToCreatePayload,
  formValuesToProfilePayload,
  formValuesToUpdatePayload,
  getEnterpriseFormSchema,
  resolveCreditChange,
} from '../enterprise-form'

const t = ((key: string) => key) as unknown as TFunction

const QUOTA_PER_UNIT = 500_000

const prepaidEnterprise: Enterprise = {
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
  owner_group: 'vip',
  created_at: 0,
  updated_at: 0,
}

const creditEnterprise: Enterprise = {
  ...prepaidEnterprise,
  billing_mode: 'credit',
  credit_cycle_type: 'natural_month',
  credit_limit_quota: 50 * QUOTA_PER_UNIT,
  credit_alert_percent: 0,
}

const pickedUser = {
  id: 42,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'vip',
}

const creditValues: EnterpriseFormValues = {
  ...ENTERPRISE_FORM_DEFAULT_VALUES,
  name: 'Acme',
  billing_mode: 'credit',
  credit: { ...ENTERPRISE_FORM_DEFAULT_VALUES.credit, limit_usd: 500 },
}

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

  test('upgrade mode without a picked user reports it and ignores account fields', () => {
    const values = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      mode: 'upgrade' as const,
      name: 'Acme',
    }
    expect(errorPaths(values, false)).toEqual(['upgrade_user'])
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
    expect(
      enterpriseToFormValues(prepaidEnterprise, QUOTA_PER_UNIT).max_tokens
    ).toBe(300)
  })

  test('an empty group is rejected in every mode', () => {
    const values = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      name: 'Acme',
      group: '',
    }
    expect(
      errorPaths(
        { ...values, username: 'acme', password: 'password123' },
        false
      )
    ).toEqual(['group'])
    expect(errorPaths(values, true)).toEqual(['group'])
    expect(
      errorPaths(
        { ...values, mode: 'upgrade', upgrade_user: pickedUser },
        false
      )
    ).toEqual(['group'])
  })

  test('a cleared credit limit is reported as missing instead of submitted as 0', () => {
    const values = {
      ...creditValues,
      credit: { ...creditValues.credit, limit_usd: Number.NaN },
    }
    const result = getEnterpriseFormSchema(t, true).safeParse(values)
    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['credit', 'limit_usd'],
        message: 'Enter the credit limit per period',
      }),
    ])
  })

  test('all field errors are reported together, including refinements', () => {
    const values = {
      ...creditValues,
      name: '',
      credit: { ...creditValues.credit, limit_usd: Number.NaN },
    }
    expect(errorPaths(values, true)).toEqual(['name', 'credit.limit_usd'])
  })

  test('a new account rejects an invalid login email but accepts an empty one', () => {
    const values = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      name: 'Acme',
      username: 'acme',
      password: 'password123',
    }
    expect(errorPaths({ ...values, email: 'nope' }, false)).toEqual(['email'])
    expect(errorPaths({ ...values, email: '' }, false)).toEqual([])
  })

  test.each(['natural_month', 'fixed_days', 'quota_based'] as const)(
    '%s credit requires a limit greater than 0',
    (cycleType) => {
      const values = {
        ...creditValues,
        credit: { ...creditValues.credit, cycle_type: cycleType, limit_usd: 0 },
      }
      expect(errorPaths(values, true)).toEqual(['credit.limit_usd'])
    }
  )

  test('credit rejects a negative limit and an alert threshold above 99', () => {
    const values = {
      ...creditValues,
      credit: { ...creditValues.credit, limit_usd: -1, alert_percent: 100 },
    }
    expect(errorPaths(values, true)).toEqual([
      'credit.limit_usd',
      'credit.alert_percent',
    ])
  })

  test('invalid credit fields are ignored while prepaid is selected', () => {
    const values = {
      ...creditValues,
      billing_mode: 'prepaid' as const,
      credit: { ...creditValues.credit, limit_usd: -1, alert_percent: 100 },
    }
    expect(errorPaths(values, true)).toEqual([])
  })

  test('fixed days credit rejects a cycle length outside 1..366', () => {
    const values = {
      ...creditValues,
      credit: {
        ...creditValues.credit,
        cycle_type: 'fixed_days' as const,
        cycle_days: 0,
      },
    }
    expect(errorPaths(values, true)).toEqual(['credit.cycle_days'])
  })

  test('upgrade payload sends the picked user id without credentials', () => {
    const values = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      mode: 'upgrade' as const,
      name: 'Acme',
      upgrade_user: pickedUser,
      username: 'ignored',
    }
    const payload = formValuesToCreatePayload(values)
    expect(payload).toMatchObject({ mode: 'upgrade', user_id: 42 })
    expect(payload).not.toHaveProperty('username')
    expect(payload.enterprise.name).toBe('Acme')
  })

  test('new account payload carries the login email and group', () => {
    const payload = formValuesToCreatePayload({
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      name: 'Acme',
      username: 'acme',
      password: 'password123',
      email: 'owner@acme.test',
      group: 'vip',
    })
    expect(payload).toMatchObject({
      mode: 'new_user',
      email: 'owner@acme.test',
      group: 'vip',
    })
  })

  test('upgrade payload omits the group when it equals the user group and sends a changed one', () => {
    const values: EnterpriseFormValues = {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      mode: 'upgrade',
      name: 'Acme',
      upgrade_user: pickedUser,
      group: 'vip',
    }
    expect(formValuesToCreatePayload(values).group).toBeUndefined()
    expect(formValuesToCreatePayload({ ...values, group: 'svip' }).group).toBe(
      'svip'
    )
  })

  test('update payload sends the group only when it changed', () => {
    const values = enterpriseToFormValues(prepaidEnterprise, QUOTA_PER_UNIT)
    expect(formValuesToUpdatePayload(values, 'vip')).not.toHaveProperty('group')
    expect(
      formValuesToUpdatePayload({ ...values, group: 'svip' }, 'vip').group
    ).toBe('svip')
  })
})

describe('credit change detection', () => {
  const savedCredit = enterpriseToFormValues(creditEnterprise, QUOTA_PER_UNIT)

  test('an existing credit enterprise fills limit in USD and keeps a disabled alert', () => {
    expect(savedCredit.billing_mode).toBe('credit')
    expect(savedCredit.credit).toMatchObject({
      cycle_type: 'natural_month',
      limit_usd: 50,
      alert_percent: 0,
    })
  })

  test('editing only the profile of a credit enterprise needs no credit call', () => {
    expect(
      resolveCreditChange(savedCredit, { ...savedCredit, name: 'Acme Ltd' })
    ).toBe('none')
  })

  test('changing the limit configures credit', () => {
    expect(
      resolveCreditChange(savedCredit, {
        ...savedCredit,
        credit: { ...savedCredit.credit, limit_usd: 80 },
      })
    ).toBe('configure')
  })

  test('a hidden cycle days value does not count as a change for calendar month', () => {
    expect(
      resolveCreditChange(savedCredit, {
        ...savedCredit,
        credit: { ...savedCredit.credit, cycle_days: 45 },
      })
    ).toBe('none')
  })

  test('switching credit to prepaid disables credit and prepaid to credit configures it', () => {
    expect(
      resolveCreditChange(savedCredit, {
        ...savedCredit,
        billing_mode: 'prepaid',
      })
    ).toBe('disable')
    const savedPrepaid = enterpriseToFormValues(
      prepaidEnterprise,
      QUOTA_PER_UNIT
    )
    expect(
      resolveCreditChange(savedPrepaid, {
        ...savedPrepaid,
        billing_mode: 'credit',
      })
    ).toBe('configure')
    expect(resolveCreditChange(savedPrepaid, savedPrepaid)).toBe('none')
  })
})
