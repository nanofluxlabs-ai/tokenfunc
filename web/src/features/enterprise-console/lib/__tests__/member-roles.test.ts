import { describe, expect, it } from 'vitest'

import type { EnterpriseActor } from '../../types'
import { isEnterpriseAccount } from '../member-roles'

const actor = (overrides: Partial<EnterpriseActor>): EnterpriseActor => ({
  member_id: 1,
  role: 'developer',
  team_id: 1,
  is_owner: false,
  provisioned: false,
  ...overrides,
})

describe('isEnterpriseAccount', () => {
  it('treats the owner and provisioned logins as enterprise accounts', () => {
    expect(isEnterpriseAccount(actor({ is_owner: true }))).toBe(true)
    expect(isEnterpriseAccount(actor({ provisioned: true }))).toBe(true)
  })

  it('keeps members bound to an existing account and non-members as ordinary users', () => {
    expect(isEnterpriseAccount(actor({ role: 'enterprise_admin' }))).toBe(false)
    expect(isEnterpriseAccount(null)).toBe(false)
    expect(isEnterpriseAccount(undefined)).toBe(false)
  })
})
