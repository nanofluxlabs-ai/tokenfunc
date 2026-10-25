import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Member } from '../../types'
import { MemberPicker } from '../member-picker'

const listMembersMock = vi.hoisted(() => vi.fn())
vi.mock('../../api', () => ({ listMembers: listMembersMock }))

function member(partial: Partial<Member> & { id: number }): Member {
  return {
    team_id: 0,
    team_name: '',
    name: `Member ${partial.id}`,
    email: '',
    employee_no: '',
    user_id: 0,
    username: '',
    role: 'none',
    provisioned: false,
    status: 'active',
    remark: '',
    token_count: 0,
    month_quota: 0,
    created_at: 0,
    ...partial,
  }
}

function Harness(props: {
  initialValue: number
  selectedLabel?: string
  allowAny?: boolean
  teamId?: number
}) {
  const [value, setValue] = useState(props.initialValue)
  return (
    <>
      <MemberPicker
        value={value}
        onChange={setValue}
        selectedLabel={props.selectedLabel}
        allowAny={props.allowAny}
        teamId={props.teamId}
        noneLabel='Team key (no holder)'
        aria-label='Member'
      />
      <output data-testid='selected-member'>{value}</output>
    </>
  )
}

function renderPicker(props: Parameters<typeof Harness>[0]) {
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
  listMembersMock.mockResolvedValue({
    success: true,
    data: {
      items: [
        member({ id: 7, name: 'Alice', team_name: 'R&D' }),
        member({ id: 9, name: 'Bob' }),
      ],
      total: 2,
    },
  })
})

afterEach(() => {
  listMembersMock.mockReset()
})

describe('MemberPicker', () => {
  test('renders a select-style trigger showing the none label while closed and hides the search box', () => {
    renderPicker({ initialValue: 0 })

    const trigger = screen.getByRole('combobox', { name: 'Member' })
    expect(trigger.tagName).toBe('BUTTON')
    // 与 SelectTrigger 同一套样式：高度由 data-size 驱动，宽度撑满表单
    expect(trigger).toHaveAttribute('data-size', 'default')
    expect(trigger).toHaveClass('data-[size=default]:h-8', 'w-full')
    expect(trigger).toHaveTextContent('Team key (no holder)')
    expect(screen.queryByPlaceholderText('Search members...')).toBeNull()
    expect(listMembersMock).not.toHaveBeenCalled()
  })

  test('shows the selected label when the member is not in the current results', () => {
    renderPicker({ initialValue: 42, selectedLabel: 'Carol' })

    expect(screen.getByRole('combobox', { name: 'Member' })).toHaveTextContent(
      'Carol'
    )
  })

  test('opens a popup with the search box and server results scoped to the team, and selecting one updates the value', async () => {
    renderPicker({ initialValue: 0, allowAny: true, teamId: 3 })

    fireEvent.click(screen.getByRole('combobox', { name: 'Member' }))

    expect(
      await screen.findByPlaceholderText('Search members...')
    ).toBeInTheDocument()
    const alice = await screen.findByRole('option', { name: /Alice/ })
    expect(alice).toHaveTextContent('R&D')
    expect(
      screen.getByRole('option', { name: 'All Members' })
    ).toBeInTheDocument()
    expect(listMembersMock).toHaveBeenCalledWith({
      status: 'active',
      team_id: 3,
      keyword: undefined,
      page_size: 20,
    })

    fireEvent.click(alice)

    expect(screen.getByTestId('selected-member')).toHaveTextContent('7')
    expect(screen.getByRole('combobox', { name: 'Member' })).toHaveTextContent(
      'Alice'
    )
  })
})
