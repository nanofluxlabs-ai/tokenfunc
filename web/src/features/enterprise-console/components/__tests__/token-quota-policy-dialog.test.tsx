import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { EnterpriseToken } from '../../types'
import { TokenQuotaPolicyDialog } from '../token-quota-policy-dialog'

const apiMock = vi.hoisted(() => ({
  setTokenQuotaPolicy: vi.fn(),
  batchSetTokenQuotaPolicy: vi.fn(),
}))
vi.mock('../../api', () => apiMock)

const monthlyKey: EnterpriseToken = {
  id: 3,
  name: 'monthly-key',
  key: 'abcd**********wxyz',
  status: 1,
  remain_quota: 1_000_000,
  unlimited_quota: false,
  used_quota: 0,
  expired_time: -1,
  created_time: 1,
  accessed_time: 1,
  group: '',
  model_limits_enabled: false,
  model_limits: '',
  allow_ips: '',
  team_id: 6,
  team_name: 'Research',
  team_status: 'active',
  member_id: 0,
  member_name: '',
  month_quota: 0,
  prev_month_quota: 0,
  reset_period: 'monthly',
  period_quota: 2_500_000,
  next_reset_at: 1_792_944_000,
}

function renderDialog(
  props: Partial<Parameters<typeof TokenQuotaPolicyDialog>[0]> & {
    tokenIds: number[]
  }
) {
  const onSaved = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <TokenQuotaPolicyDialog
      open
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      {...props}
    />
  )
  return { onSaved, onOpenChange }
}

beforeEach(() => {
  apiMock.setTokenQuotaPolicy.mockResolvedValue({ success: true })
  apiMock.batchSetTokenQuotaPolicy.mockResolvedValue({
    success: true,
    data: { updated: 2 },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('TokenQuotaPolicyDialog', () => {
  test('a single key defaults to daily and submits the amount in quota units', async () => {
    const { onSaved, onOpenChange } = renderDialog({ tokenIds: [3] })

    expect(screen.getByText('Set periodic quota')).toBeInTheDocument()
    expect(screen.getByLabelText('Reset period')).toHaveValue('daily')
    expect(screen.getByText(/Next reset: /)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Period quota (USD)'), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(apiMock.setTokenQuotaPolicy).toHaveBeenCalledWith(3, {
        reset_period: 'daily',
        custom_seconds: 0,
        period_quota: 500_000,
      })
    )
    expect(apiMock.batchSetTokenQuotaPolicy).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('editing a key with a policy prefills its period and amount', async () => {
    renderDialog({ tokenIds: [3], current: monthlyKey })

    await waitFor(() =>
      expect(screen.getByLabelText('Reset period')).toHaveValue('monthly')
    )
    expect(screen.getByLabelText('Period quota (USD)')).toHaveValue(5)
  })

  test('a zero amount is rejected before any request is sent', async () => {
    renderDialog({ tokenIds: [3] })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Period quota must be greater than 0')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Period quota (USD)')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(apiMock.setTokenQuotaPolicy).not.toHaveBeenCalled()
  })

  test('a custom period converts hours to seconds and bounds them', async () => {
    renderDialog({ tokenIds: [3] })

    fireEvent.change(screen.getByLabelText('Reset period'), {
      target: { value: 'custom' },
    })
    fireEvent.change(screen.getByLabelText('Custom period (hours)'), {
      target: { value: '9000' },
    })
    fireEvent.change(screen.getByLabelText('Period quota (USD)'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('Custom period must be between 1 and 8784 hours')
    ).toBeInTheDocument()
    expect(apiMock.setTokenQuotaPolicy).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Custom period (hours)'), {
      target: { value: '6' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiMock.setTokenQuotaPolicy).toHaveBeenCalledWith(3, {
        reset_period: 'custom',
        custom_seconds: 6 * 3600,
        period_quota: 1_000_000,
      })
    )
  })

  test('several keys go through the batch endpoint and "no periodic quota" removes the policy', async () => {
    renderDialog({ tokenIds: [1, 2] })

    expect(
      screen.getByText('Set periodic quota for 2 keys')
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Reset period'), {
      target: { value: 'never' },
    })
    expect(screen.queryByLabelText('Period quota (USD)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(apiMock.batchSetTokenQuotaPolicy).toHaveBeenCalledWith([1, 2], {
        reset_period: 'never',
        custom_seconds: 0,
        period_quota: 0,
      })
    )
    expect(apiMock.setTokenQuotaPolicy).not.toHaveBeenCalled()
  })
})
