import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'

import type { EnterpriseListItem } from '../../types'
import { EnterpriseRowActions } from '../enterprise-row-actions'
import { EnterprisesProvider, useEnterprises } from '../enterprises-provider'

function OpenProbe() {
  const { open, currentRow } = useEnterprises()
  return (
    <output data-testid='open-state'>
      {open ?? 'none'}:{currentRow?.id ?? 0}
    </output>
  )
}

function renderActions(overrides: Partial<EnterpriseListItem>) {
  const enterprise = {
    id: 5,
    user_id: 42,
    name: 'Acme',
    username: 'acme-owner',
    billing_mode: 'prepaid',
    status: 'active',
    ...overrides,
  } as EnterpriseListItem
  render(
    <EnterprisesProvider>
      <EnterpriseRowActions enterprise={enterprise} />
      <OpenProbe />
    </EnterprisesProvider>
  )
}

afterEach(cleanup)

test('a prepaid enterprise exposes a Top-up action that opens the topup dialog for that row', async () => {
  renderActions({ billing_mode: 'prepaid' })

  const button = screen.getByRole('button', { name: 'Top-up' })
  expect(button).toBeEnabled()
  await userEvent.click(button)

  expect(screen.getByTestId('open-state')).toHaveTextContent('topup:5')
})

test('a credit enterprise keeps the Top-up action disabled because it is settled by bill payment', () => {
  renderActions({ billing_mode: 'credit' })

  expect(screen.getByRole('button', { name: 'Top-up' })).toBeDisabled()
  expect(screen.getByTestId('open-state')).toHaveTextContent('none:0')
})
