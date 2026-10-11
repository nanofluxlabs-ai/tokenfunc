import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Employee } from '../../types'
import { EmployeePicker } from '../employee-picker'

const listEmployeesMock = vi.hoisted(() => vi.fn())
vi.mock('../../api', () => ({ listEmployees: listEmployeesMock }))

function employee(partial: Partial<Employee> & { id: number }): Employee {
  return {
    department_id: 0,
    department_name: '',
    name: `Employee ${partial.id}`,
    email: '',
    employee_no: '',
    status: 'active',
    remark: '',
    token_count: 0,
    created_at: 0,
    ...partial,
  }
}

function Harness(props: {
  initialValue: number
  selectedLabel?: string
  allowAny?: boolean
}) {
  const [value, setValue] = useState(props.initialValue)
  return (
    <>
      <EmployeePicker
        value={value}
        onChange={setValue}
        selectedLabel={props.selectedLabel}
        allowAny={props.allowAny}
        noneLabel='Shared (no employee)'
        aria-label='Employee'
      />
      <output data-testid='selected-employee'>{value}</output>
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
  listEmployeesMock.mockResolvedValue({
    success: true,
    data: {
      items: [
        employee({ id: 7, name: 'Alice', department_name: 'R&D' }),
        employee({ id: 9, name: 'Bob' }),
      ],
      total: 2,
    },
  })
})

afterEach(() => {
  listEmployeesMock.mockReset()
})

describe('EmployeePicker', () => {
  test('renders a select-style trigger showing the none label while closed and hides the search box', () => {
    renderPicker({ initialValue: 0 })

    const trigger = screen.getByRole('combobox', { name: 'Employee' })
    expect(trigger.tagName).toBe('BUTTON')
    // 与 SelectTrigger 同一套样式：高度由 data-size 驱动，宽度撑满表单
    expect(trigger).toHaveAttribute('data-size', 'default')
    expect(trigger).toHaveClass('data-[size=default]:h-8', 'w-full')
    expect(trigger).toHaveTextContent('Shared (no employee)')
    expect(screen.queryByPlaceholderText('Search employees...')).toBeNull()
    expect(listEmployeesMock).not.toHaveBeenCalled()
  })

  test('shows the selected label when the employee is not in the current results', () => {
    renderPicker({ initialValue: 42, selectedLabel: 'Carol' })

    expect(
      screen.getByRole('combobox', { name: 'Employee' })
    ).toHaveTextContent('Carol')
  })

  test('opens a popup with the search box and server results, and selecting one updates the value', async () => {
    renderPicker({ initialValue: 0, allowAny: true })

    fireEvent.click(screen.getByRole('combobox', { name: 'Employee' }))

    expect(
      await screen.findByPlaceholderText('Search employees...')
    ).toBeInTheDocument()
    const alice = await screen.findByRole('option', { name: /Alice/ })
    expect(alice).toHaveTextContent('R&D')
    expect(
      screen.getByRole('option', { name: 'All Employees' })
    ).toBeInTheDocument()
    expect(listEmployeesMock).toHaveBeenCalledWith({
      status: 'active',
      keyword: undefined,
      page_size: 20,
    })

    fireEvent.click(alice)

    expect(screen.getByTestId('selected-employee')).toHaveTextContent('7')
    expect(
      screen.getByRole('combobox', { name: 'Employee' })
    ).toHaveTextContent('Alice')
  })
})
