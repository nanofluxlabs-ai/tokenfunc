import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ContactSection } from '../components/contact-section'

const submitTrialLead = vi.fn()

vi.mock('../api', () => ({
  submitTrialLead: (payload: unknown) => submitTrialLead(payload),
}))

beforeEach(() => {
  submitTrialLead.mockReset()
})

afterEach(() => {
  cleanup()
})

function renderSection() {
  return render(
    <ContactSection onContactSales={() => {}} salesQrConfigured={false} />
  )
}

describe('ContactSection trial request form', () => {
  it('groups the monthly usage options under a legend with the middle option pressed by default', () => {
    renderSection()

    const group = screen.getByRole('group', { name: 'Estimated monthly usage' })
    expect(group.tagName).toBe('FIELDSET')
    expect(screen.getByRole('button', { name: '$1k–10k/mo' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('hides the sales WeChat button when no QR code is configured', () => {
    renderSection()

    expect(
      screen.queryByRole('button', { name: 'Add our sales team on WeChat' })
    ).not.toBeInTheDocument()
  })

  it('shows validation errors and does not submit when fields are empty', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(
      await screen.findByText('Please enter your company name')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Please enter your WeChat ID or phone number')
    ).toBeInTheDocument()
    expect(submitTrialLead).not.toHaveBeenCalled()
  })

  it('submits the trimmed values with the selected volume and shows the success state', async () => {
    submitTrialLead.mockResolvedValue({ success: true, data: { id: 1 } })
    const user = userEvent.setup()
    renderSection()

    await user.type(screen.getByLabelText('Company name'), '  Acme Inc ')
    await user.type(
      screen.getByLabelText('WeChat ID or phone number'),
      'wx_123456'
    )
    const highVolume = screen.getByRole('button', { name: '> $10k/mo' })
    expect(highVolume).toHaveAttribute('aria-pressed', 'false')
    await user.click(highVolume)
    expect(highVolume).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Submit application' }))

    await waitFor(() =>
      expect(submitTrialLead).toHaveBeenCalledWith({
        company: 'Acme Inc',
        contact: 'wx_123456',
        volume: 'gt_10k',
      })
    )
    expect(await screen.findByRole('status')).toHaveTextContent('wx_123456')
    expect(
      screen.queryByRole('button', { name: 'Submit application' })
    ).not.toBeInTheDocument()
  })

  it('keeps the form when the server rejects the request', async () => {
    submitTrialLead.mockResolvedValue({
      success: false,
      message: 'too many requests',
    })
    const user = userEvent.setup()
    renderSection()

    await user.type(screen.getByLabelText('Company name'), 'Acme')
    await user.type(
      screen.getByLabelText('WeChat ID or phone number'),
      'wx_123456'
    )
    await user.click(screen.getByRole('button', { name: 'Submit application' }))

    await waitFor(() => expect(submitTrialLead).toHaveBeenCalledTimes(1))
    expect(
      screen.getByRole('button', { name: 'Submit application' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
