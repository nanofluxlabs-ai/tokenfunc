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

test('billing, members and reset password live in the overflow menu and open the matching dialog', async () => {
  renderActions({ billing_mode: 'credit' })

  // 行上只露出编辑与充值两个图标，其余收进「更多」菜单
  expect(
    screen.queryByRole('button', { name: 'Billing' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Members' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Reset password' })
  ).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'Reset password' })
  )

  expect(screen.getByTestId('open-state')).toHaveTextContent('reset-password:5')

  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
  await userEvent.click(
    await screen.findByRole('menuitem', { name: 'Members' })
  )
  expect(screen.getByTestId('open-state')).toHaveTextContent('members:5')
})
