import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { type PickedUser, UserPicker } from '../user-picker'

const searchUsersMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/users/api', () => ({ searchUsers: searchUsersMock }))

function user(id: number, username: string, role = 1, group = 'default') {
  return {
    id,
    username,
    display_name: `${username} name`,
    role,
    status: 1,
    quota: 0,
    used_quota: 0,
    request_count: 0,
    group,
  }
}

type HarnessProps = { disabledIds?: number[]; userType?: 'personal' }

function Harness(props: HarnessProps) {
  const [value, setValue] = useState<PickedUser | null>(null)
  return (
    <>
      <UserPicker
        value={value}
        onChange={setValue}
        disabledIds={props.disabledIds}
        userType={props.userType}
        aria-label='User'
      />
      <output data-testid='picked'>
        {value ? `${value.id}:${value.group}` : 'none'}
      </output>
    </>
  )
}

function renderPicker(props: HarnessProps = {}) {
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
      items: [
        user(7, 'alice', 1, 'vip'),
        user(9, 'root', 100),
        user(11, 'bob'),
      ],
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

  expect(screen.getByTestId('picked')).toHaveTextContent('7:vip')
  expect(screen.getByRole('combobox', { name: 'User' })).toHaveTextContent(
    'alice #7'
  )
})

test('a user type limits the search to that kind of user', async () => {
  renderPicker({ userType: 'personal' })
  fireEvent.click(screen.getByRole('combobox', { name: 'User' }))

  await screen.findByRole('option', { name: /alice #7/ })
  expect(searchUsersMock).toHaveBeenCalledWith(
    expect.objectContaining({ status: '1', user_type: 'personal' })
  )
})

test('without a user type no user_type filter is sent', async () => {
  renderPicker()
  fireEvent.click(screen.getByRole('combobox', { name: 'User' }))

  await screen.findByRole('option', { name: /alice #7/ })
  expect(searchUsersMock.mock.calls[0][0].user_type).toBeUndefined()
})
