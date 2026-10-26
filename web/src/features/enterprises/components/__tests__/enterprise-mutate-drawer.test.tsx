import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getCurrencyDisplay } from '@/lib/currency'

import type { EnterpriseListItem } from '../../types'
import { EnterpriseMutateDrawer } from '../enterprise-mutate-drawer'
import { EnterprisesProvider } from '../enterprises-provider'

const apiMock = vi.hoisted(() => ({
  createEnterprise: vi.fn(),
  updateEnterprise: vi.fn(),
  getEnterprise: vi.fn(),
  configureEnterpriseCredit: vi.fn(),
  disableEnterpriseCredit: vi.fn(),
  listEnterpriseGroupOptions: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const searchUsersMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/users/api', () => ({ searchUsers: searchUsersMock }))

const verificationMock = vi.hoisted(() => ({
  requestVerification: vi.fn(),
}))
vi.mock('@/features/auth/secure-verification', () => ({
  useSecureVerification: () => ({
    requestVerification: verificationMock.requestVerification,
    isActive: false,
    dialogProps: {},
  }),
  SecureVerificationDialog: () => null,
}))

const PROOF = {
  proof_token: 'proof-1',
  method: 'password',
  scope: 'admin.user.manage',
  expires_at: 0,
}

function quota(usd: number) {
  return usd * getCurrencyDisplay().config.quotaPerUnit
}

function makeRow(overrides: Partial<EnterpriseListItem>): EnterpriseListItem {
  return {
    id: 5,
    user_id: 42,
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
    max_tokens: 0,
    owner_group: 'vip',
    remark: '',
    created_at: 0,
    updated_at: 0,
    username: 'acme',
    display_name: 'acme',
    email: '',
    quota: 0,
    used_quota: 0,
    user_status: 1,
    period_limit_quota: 0,
    period_used_quota: 0,
    period_start_at: 0,
    period_end_at: 0,
    member_count: 0,
    login_count: 0,
    ...overrides,
  }
}

function creditRow(overrides: Partial<EnterpriseListItem> = {}) {
  return makeRow({
    billing_mode: 'credit',
    credit_cycle_type: 'natural_month',
    credit_limit_quota: quota(50),
    period_limit_quota: quota(50),
    period_used_quota: quota(30),
    ...overrides,
  })
}

/**
 * 模拟企业列表：第一步保存后列表刷新，会把同一企业的新行对象同步给抽屉（enterprises-table 的行为）
 */
function renderDrawerWithListSync(row: EnterpriseListItem) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onOpenChange = vi.fn()
  const view = render(
    <QueryClientProvider client={client}>
      <EnterprisesProvider>
        <EnterpriseMutateDrawer
          open
          onOpenChange={onOpenChange}
          currentRow={row}
        />
      </EnterprisesProvider>
    </QueryClientProvider>
  )
  const syncRow = (fresh: EnterpriseListItem) =>
    act(() =>
      view.rerender(
        <QueryClientProvider client={client}>
          <EnterprisesProvider>
            <EnterpriseMutateDrawer
              open
              onOpenChange={onOpenChange}
              currentRow={fresh}
            />
          </EnterprisesProvider>
        </QueryClientProvider>
      )
    )
  return { onOpenChange, syncRow }
}

function renderDrawer(currentRow?: EnterpriseListItem) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <EnterprisesProvider>
        <EnterpriseMutateDrawer
          open
          onOpenChange={onOpenChange}
          currentRow={currentRow}
        />
      </EnterprisesProvider>
    </QueryClientProvider>
  )
  return { onOpenChange }
}

async function setLimit(value: string) {
  const input = screen.getByLabelText('Credit limit per period (USD)')
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

async function save() {
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
}

async function expandSection(title: string) {
  await userEvent.click(screen.getByRole('button', { name: title }))
}

beforeEach(() => {
  apiMock.listEnterpriseGroupOptions.mockResolvedValue({
    success: true,
    data: [
      { group: 'default', ratio: 1 },
      { group: 'vip', ratio: 0.8 },
    ],
  })
  apiMock.updateEnterprise.mockResolvedValue({ success: true })
  apiMock.configureEnterpriseCredit.mockResolvedValue({ success: true })
  apiMock.disableEnterpriseCredit.mockResolvedValue({ success: true })
  verificationMock.requestVerification.mockResolvedValue(PROOF)
})

afterEach(() => {
  for (const mock of Object.values(apiMock)) mock.mockReset()
  verificationMock.requestVerification.mockReset()
  searchUsersMock.mockReset()
})

test('editing the credit limit saves the profile first, then verifies and configures credit', async () => {
  const { onOpenChange } = renderDrawer(creditRow())

  await setLimit('80')
  await save()

  await waitFor(() =>
    expect(apiMock.configureEnterpriseCredit).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ cycle_type: 'natural_month', limit_usd: 80 }),
      'proof-1'
    )
  )
  expect(verificationMock.requestVerification).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: 'admin.user.manage',
      context: { user_id: 42, action: 'enterprise_credit' },
    })
  )
  const updateOrder = apiMock.updateEnterprise.mock.invocationCallOrder[0]
  const verifyOrder =
    verificationMock.requestVerification.mock.invocationCallOrder[0]
  const configureOrder =
    apiMock.configureEnterpriseCredit.mock.invocationCallOrder[0]
  expect(updateOrder).toBeLessThan(verifyOrder)
  expect(verifyOrder).toBeLessThan(configureOrder)
  // 分组没改，更新请求不带 group，避免把企业主踢下线
  expect(apiMock.updateEnterprise.mock.calls[0][1]).not.toHaveProperty('group')
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('editing only the profile saves without verification or credit calls', async () => {
  const { onOpenChange } = renderDrawer(creditRow())

  await expandSection('Enterprise Profile')
  await userEvent.type(screen.getByLabelText('Contact Name'), 'Jane')
  await save()

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(apiMock.updateEnterprise).toHaveBeenCalledWith(
    5,
    expect.objectContaining({ contact_name: 'Jane' })
  )
  expect(verificationMock.requestVerification).not.toHaveBeenCalled()
  expect(apiMock.configureEnterpriseCredit).not.toHaveBeenCalled()
  expect(apiMock.disableEnterpriseCredit).not.toHaveBeenCalled()
})

test('switching a credit enterprise to prepaid shows the billing notice and disables credit with a proof', async () => {
  renderDrawer(creditRow())

  await userEvent.click(screen.getByRole('radio', { name: /^Prepaid/ }))

  expect(
    screen.getByText(
      'The current credit period will be closed and billed. Future usage is paid from the balance.'
    )
  ).toBeInTheDocument()
  await save()

  await waitFor(() =>
    expect(apiMock.disableEnterpriseCredit).toHaveBeenCalledWith(5, 'proof-1')
  )
  expect(apiMock.configureEnterpriseCredit).not.toHaveBeenCalled()
})

test('a limit at or below the period usage warns that the period stops right after saving', async () => {
  renderDrawer(creditRow())
  const warning =
    'Below the usage of the current period: the period goes over the limit and requests are rejected as soon as you save.'
  expect(screen.queryByText(warning)).not.toBeInTheDocument()

  await setLimit('20')

  expect(screen.getByText(warning)).toBeInTheDocument()
})

test('a failed credit step keeps the drawer open and says the profile was saved', async () => {
  const errorToast = vi.spyOn(toast, 'error')
  apiMock.configureEnterpriseCredit.mockResolvedValue({
    success: false,
    message: 'limit too high',
  })
  const { onOpenChange } = renderDrawer(creditRow())

  await setLimit('80')
  await save()

  await waitFor(() =>
    expect(errorToast).toHaveBeenCalledWith(
      'Enterprise profile saved, but the credit settings did not take effect',
      { description: 'limit too high' }
    )
  )
  expect(onOpenChange).not.toHaveBeenCalledWith(false)
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
})

test('a proof rejected with 403 shows the verification reason and keeps the drawer open', async () => {
  const errorToast = vi.spyOn(toast, 'error')
  const config = { headers: {} } as InternalAxiosRequestConfig
  apiMock.configureEnterpriseCredit.mockRejectedValue(
    new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, undefined, {
      status: 403,
      statusText: 'Forbidden',
      config,
      headers: {},
      data: {
        success: false,
        code: 'SECURITY_PROOF_CONTEXT_MISMATCH',
        message: 'security proof context mismatch',
      },
    })
  )
  const { onOpenChange } = renderDrawer(creditRow())

  await setLimit('80')
  await save()

  await waitFor(() =>
    expect(errorToast).toHaveBeenCalledWith(
      'Enterprise profile saved, but the credit settings did not take effect',
      {
        description:
          "Verification does not match this action's details. Please verify again.",
      }
    )
  )
  expect(onOpenChange).not.toHaveBeenCalledWith(false)
})

test('a cancelled verification keeps the drawer open and skips the credit call', async () => {
  const errorToast = vi.spyOn(toast, 'error')
  verificationMock.requestVerification.mockResolvedValue(null)
  const { onOpenChange } = renderDrawer(creditRow())

  await setLimit('80')
  await save()

  await waitFor(() =>
    expect(errorToast).toHaveBeenCalledWith(
      'Enterprise profile saved, but the credit settings did not take effect',
      { description: 'Verification was cancelled.' }
    )
  )
  expect(apiMock.configureEnterpriseCredit).not.toHaveBeenCalled()
  expect(onOpenChange).not.toHaveBeenCalledWith(false)
})

test('retrying after a failed credit step does not resend an already saved group change', async () => {
  apiMock.configureEnterpriseCredit
    .mockResolvedValueOnce({ success: false, message: 'temporary' })
    .mockResolvedValueOnce({ success: true })
  const { onOpenChange } = renderDrawer(creditRow())

  await userEvent.click(screen.getByLabelText('Group'))
  await userEvent.click(await screen.findByRole('option', { name: /default/ }))
  await setLimit('80')
  await save()
  await waitFor(() =>
    expect(apiMock.configureEnterpriseCredit).toHaveBeenCalledTimes(1)
  )
  expect(apiMock.updateEnterprise.mock.calls[0][1]).toMatchObject({
    group: 'default',
  })

  await save()

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(apiMock.updateEnterprise.mock.calls[1][1]).not.toHaveProperty('group')
  expect(apiMock.configureEnterpriseCredit).toHaveBeenCalledTimes(2)
})

test('creating a credit enterprise creates it first, then verifies against the new owner and configures credit', async () => {
  apiMock.createEnterprise.mockResolvedValue({
    success: true,
    data: makeRow({ id: 9, user_id: 77, owner_group: 'default' }),
  })
  const { onOpenChange } = renderDrawer()

  await userEvent.type(screen.getByLabelText('Username'), 'acme')
  await userEvent.type(screen.getByLabelText('Password'), 'password123')
  await userEvent.type(screen.getByLabelText('Enterprise Name'), 'Acme')
  await userEvent.click(screen.getByRole('radio', { name: /^Credit/ }))
  await setLimit('100')
  await save()

  await waitFor(() =>
    expect(apiMock.configureEnterpriseCredit).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ limit_usd: 100 }),
      'proof-1'
    )
  )
  expect(apiMock.createEnterprise).toHaveBeenCalledWith(
    expect.objectContaining({ mode: 'new_user', group: 'default' })
  )
  expect(verificationMock.requestVerification).toHaveBeenCalledWith(
    expect.objectContaining({
      context: { user_id: 77, action: 'enterprise_credit' },
    })
  )
  expect(apiMock.createEnterprise.mock.invocationCallOrder[0]).toBeLessThan(
    verificationMock.requestVerification.mock.invocationCallOrder[0]
  )
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('creating a prepaid enterprise does not ask for verification', async () => {
  apiMock.createEnterprise.mockResolvedValue({
    success: true,
    data: makeRow({ id: 9 }),
  })
  const { onOpenChange } = renderDrawer()

  await userEvent.type(screen.getByLabelText('Username'), 'acme')
  await userEvent.type(screen.getByLabelText('Password'), 'password123')
  await userEvent.type(screen.getByLabelText('Enterprise Name'), 'Acme')
  await save()

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(verificationMock.requestVerification).not.toHaveBeenCalled()
  expect(apiMock.configureEnterpriseCredit).not.toHaveBeenCalled()
})

test('the login email follows the contact email until it is edited by hand', async () => {
  renderDrawer()
  await expandSection('Enterprise Profile')
  const loginEmail = screen.getByLabelText('Login Email')
  const contactEmail = screen.getByLabelText('Contact Email')

  await userEvent.type(contactEmail, 'a@acme.test')
  expect(loginEmail).toHaveValue('a@acme.test')

  await userEvent.clear(loginEmail)
  await userEvent.type(loginEmail, 'owner@acme.test')
  await userEvent.type(contactEmail, 'u')
  expect(loginEmail).toHaveValue('owner@acme.test')
})

test('the edit drawer shows the enterprise status next to the title', () => {
  renderDrawer(creditRow({ status: 'suspended' }))
  expect(screen.getByText('Suspended')).toBeInTheDocument()
})

test('sections follow the order owner, name, group, billing, profile, invoicing, remark', () => {
  renderDrawer()

  const markers = [
    screen.getByText('Owner Account'),
    screen.getByLabelText('Enterprise Name'),
    screen.getByText('Permission Settings'),
    screen.getByText('Billing Settings'),
    screen.getByRole('button', { name: 'Enterprise Profile' }),
    screen.getByRole('button', { name: /^Billing Profile/ }),
    screen.getByLabelText('Internal Remark'),
  ]
  for (let index = 1; index < markers.length; index++) {
    expect(
      markers[index - 1].compareDocumentPosition(markers[index]) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  }
})

test('the enterprise and billing profiles start collapsed and expand on click', async () => {
  renderDrawer(creditRow())

  expect(screen.queryByLabelText('Contact Name')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Tax ID')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Enterprise Profile' })
  ).toHaveAttribute('aria-expanded', 'false')

  await expandSection('Enterprise Profile')

  expect(screen.getByLabelText('Contact Name')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Enterprise Profile' })
  ).toHaveAttribute('aria-expanded', 'true')
  expect(screen.queryByLabelText('Tax ID')).not.toBeInTheDocument()
})

test('an invalid field in a collapsed section expands it and focuses that field', async () => {
  const errorToast = vi.spyOn(toast, 'error')
  renderDrawer(creditRow({ contact_email: 'not-an-email' }))

  await save()

  const contactEmail = await screen.findByLabelText('Contact Email')
  await waitFor(() => expect(contactEmail).toHaveFocus())
  expect(contactEmail).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText('Invalid email address')).toBeInTheDocument()
  expect(screen.queryByLabelText('Tax ID')).not.toBeInTheDocument()
  expect(errorToast).toHaveBeenCalledWith(
    'Please fix the highlighted fields before saving'
  )
  expect(apiMock.updateEnterprise).not.toHaveBeenCalled()
})

test('a cleared credit limit shows the error under the field and focuses it without any request', async () => {
  renderDrawer()

  await userEvent.type(screen.getByLabelText('Username'), 'wtcorp')
  await userEvent.type(screen.getByLabelText('Password'), 'password123')
  await userEvent.type(screen.getByLabelText('Enterprise Name'), 'WT Corp')
  await userEvent.click(screen.getByRole('radio', { name: /^Credit/ }))
  const limit = screen.getByLabelText('Credit limit per period (USD)')
  await userEvent.clear(limit)
  expect(limit).toHaveValue(null)
  await save()

  expect(
    await screen.findByText('Enter the credit limit per period')
  ).toBeInTheDocument()
  await waitFor(() => expect(limit).toHaveFocus())
  expect(apiMock.createEnterprise).not.toHaveBeenCalled()
})

test('a missing enterprise name is reported right below the owner account', async () => {
  renderDrawer()

  await userEvent.type(screen.getByLabelText('Username'), 'wtcorp')
  await userEvent.type(screen.getByLabelText('Password'), 'password123')
  await save()

  expect(
    await screen.findByText('Enterprise name is required')
  ).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.getByLabelText('Enterprise Name')).toHaveFocus()
  )
  expect(apiMock.createEnterprise).not.toHaveBeenCalled()
})

test('upgrading picks a personal user, defaults the group to theirs and omits an unchanged group', async () => {
  searchUsersMock.mockResolvedValue({
    success: true,
    data: {
      items: [
        {
          id: 7,
          username: 'alice',
          display_name: 'Alice',
          role: 1,
          status: 1,
          quota: 0,
          used_quota: 0,
          request_count: 0,
          group: 'vip',
        },
      ],
      total: 1,
    },
  })
  apiMock.createEnterprise.mockResolvedValue({
    success: true,
    data: makeRow({ id: 9, user_id: 7 }),
  })
  const { onOpenChange } = renderDrawer()

  await userEvent.click(
    screen.getByRole('combobox', { name: 'Account Source' })
  )
  await userEvent.click(
    await screen.findByRole('option', { name: 'Upgrade an existing user' })
  )
  await userEvent.click(
    screen.getByRole('combobox', { name: 'User to upgrade' })
  )
  await userEvent.click(await screen.findByRole('option', { name: /alice #7/ }))

  expect(searchUsersMock).toHaveBeenCalledWith(
    expect.objectContaining({ status: '1', user_type: 'personal' })
  )
  await waitFor(() =>
    expect(screen.getByLabelText('Group')).toHaveValue('vip · 0.8×')
  )
  await userEvent.type(screen.getByLabelText('Enterprise Name'), 'Alice Co')
  await save()

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  const payload = apiMock.createEnterprise.mock.calls[0][0]
  expect(payload).toMatchObject({ mode: 'upgrade', user_id: 7 })
  expect(payload.group).toBeUndefined()
})

describe('editing group and billing together while the list refreshes', () => {
  const row = creditRow({
    credit_limit_quota: quota(500),
    period_limit_quota: quota(500),
  })

  beforeEach(() => {
    apiMock.listEnterpriseGroupOptions.mockResolvedValue({
      success: true,
      data: [
        { group: 'vip', ratio: 0.8 },
        { group: 'svip', ratio: 0.6 },
      ],
    })
  })

  async function pickGroup(name: RegExp) {
    await userEvent.click(screen.getByLabelText('Group'))
    await userEvent.click(await screen.findByRole('option', { name }))
  }

  function prepaidRadio() {
    return screen.getByRole('radio', { name: /^Prepaid/ })
  }

  test('switching credit to prepaid keeps the choice on screen and disables credit after verification', async () => {
    const view = renderDrawerWithListSync(row)
    let prepaidCheckedDuringVerification: string | null = null
    verificationMock.requestVerification.mockImplementation(async () => {
      // 第一步保存后列表刷新，抽屉收到同一企业的新行对象（分组已是 svip、仍是授信）
      view.syncRow({ ...row, owner_group: 'svip' })
      prepaidCheckedDuringVerification =
        prepaidRadio().getAttribute('aria-checked')
      return PROOF
    })

    await pickGroup(/^svip/)
    await userEvent.click(prepaidRadio())
    await save()

    await waitFor(() =>
      expect(apiMock.disableEnterpriseCredit).toHaveBeenCalledWith(5, 'proof-1')
    )
    expect(apiMock.updateEnterprise.mock.calls[0][1]).toMatchObject({
      group: 'svip',
    })
    expect(apiMock.updateEnterprise.mock.invocationCallOrder[0]).toBeLessThan(
      verificationMock.requestVerification.mock.invocationCallOrder[0]
    )
    expect(prepaidCheckedDuringVerification).toBe('true')
    expect(apiMock.configureEnterpriseCredit).not.toHaveBeenCalled()
    expect(view.onOpenChange).toHaveBeenCalledWith(false)
  })

  test('changing the group and the limit configures credit with the new limit', async () => {
    const view = renderDrawerWithListSync(row)
    verificationMock.requestVerification.mockImplementation(async () => {
      view.syncRow({ ...row, owner_group: 'svip' })
      return PROOF
    })

    await pickGroup(/^svip/)
    await setLimit('800')
    await save()

    await waitFor(() =>
      expect(apiMock.configureEnterpriseCredit).toHaveBeenCalledWith(
        5,
        expect.objectContaining({
          cycle_type: 'natural_month',
          limit_usd: 800,
        }),
        'proof-1'
      )
    )
    expect(apiMock.updateEnterprise.mock.calls[0][1]).toMatchObject({
      group: 'svip',
    })
    expect(apiMock.disableEnterpriseCredit).not.toHaveBeenCalled()
  })

  test('a cancelled verification keeps prepaid selected and the retry disables credit without resending the group', async () => {
    const view = renderDrawerWithListSync(row)
    verificationMock.requestVerification
      .mockImplementationOnce(async () => {
        view.syncRow({ ...row, owner_group: 'svip' })
        return null
      })
      .mockResolvedValueOnce(PROOF)

    await pickGroup(/^svip/)
    await userEvent.click(prepaidRadio())
    await save()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    )
    expect(verificationMock.requestVerification).toHaveBeenCalledTimes(1)
    expect(prepaidRadio()).toHaveAttribute('aria-checked', 'true')
    expect(apiMock.disableEnterpriseCredit).not.toHaveBeenCalled()

    await save()

    await waitFor(() =>
      expect(apiMock.disableEnterpriseCredit).toHaveBeenCalledWith(5, 'proof-1')
    )
    expect(apiMock.updateEnterprise.mock.calls[1][1]).not.toHaveProperty(
      'group'
    )
    expect(view.onOpenChange).toHaveBeenCalledWith(false)
  })
})
