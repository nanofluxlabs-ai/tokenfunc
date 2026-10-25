import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { UserPicker } from '../components/user-picker'
import type { PickedUser } from '../types'

const searchUsersMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/users/api', () => ({ searchUsers: searchUsersMock }))

function user(id: number, username: string, role = 1) {
  return {
    id,
    username,
    display_name: `${username} name`,
    role,
    status: 1,
    quota: 0,
    used_quota: 0,
    request_count: 0,
    group: 'default',
  }
}

function Harness(props: { disabledIds?: number[] }) {
  const [value, setValue] = useState<PickedUser | null>(null)
  return (
    <>
      <UserPicker
        value={value}
        onChange={setValue}
        disabledIds={props.disabledIds}
        aria-label='User'
      />
      <output data-testid='picked'>{value ? value.id : 'none'}</output>
    </>
  )
}

function renderPicker(props: { disabledIds?: number[] } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  searchUsersMock.mockResolvedValue({
    success: true,
    data: {
      items: [user(7, 'alice'), user(9, 'root', 100), user(11, 'bob')],
      total: 3,
    },
  })
})

afterEach(() => {
  cleanup()
  searchUsersMock.mockReset()
})

test('searches enabled users only after opening and disables admins and already-bound users', async () => {
  renderPicker({ disabledIds: [11] })
  expect(searchUsersMock).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('combobox', { name: 'User' }))

  const alice = await screen.findByRole('option', { name: /alice #7/ })
  expect(alice).toHaveTextContent('alice name')
  expect(searchUsersMock).toHaveBeenCalledWith({
    keyword: '',
    status: '1',
    p: 1,
    page_size: 10,
  })
  expect(screen.getByRole('option', { name: /root #9/ })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  expect(screen.getByRole('option', { name: /bob #11/ })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  expect(alice).not.toHaveAttribute('aria-disabled', 'true')
})

test('selecting an option reports the user and shows it in the trigger', async () => {
  renderPicker()
  fireEvent.click(screen.getByRole('combobox', { name: 'User' }))
  fireEvent.click(await screen.findByRole('option', { name: /alice #7/ }))

  expect(screen.getByTestId('picked')).toHaveTextContent('7')
  expect(screen.getByRole('combobox', { name: 'User' })).toHaveTextContent(
    'alice #7'
  )
})
