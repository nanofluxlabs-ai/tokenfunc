/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ParamTable } from '../components/param-table'

afterEach(cleanup)

const PARAMS = [
  {
    name: 'model',
    type: 'string',
    required: true,
    descriptionKey:
      'The model identifier to pass as the model parameter in requests.',
  },
  {
    name: 'temperature',
    type: 'number',
    defaultValue: '1',
    descriptionKey:
      'Sampling randomness between 0 and 2; higher values make output more random.',
  },
] as const

describe('ParamTable', () => {
  it('renders one row per parameter with name, type and description', () => {
    render(<ParamTable params={[...PARAMS]} />)

    expect(screen.getByText('model')).toBeInTheDocument()
    expect(screen.getByText('temperature')).toBeInTheDocument()
    // 类型 / 默认值在桌面列与手机参数名下各渲染一份，由断点决定显示哪份
    expect(screen.getAllByText('string')).toHaveLength(2)
    expect(screen.getAllByText('number')).toHaveLength(2)
    expect(
      screen.getByText(
        'The model identifier to pass as the model parameter in requests.'
      )
    ).toBeInTheDocument()
    expect(screen.getAllByText('1')).toHaveLength(2)
  })

  it('shows descriptions as wrapping text instead of a single-line truncated cell', () => {
    render(<ParamTable params={[...PARAMS]} />)

    const description = screen.getByText(
      'Sampling randomness between 0 and 2; higher values make output more random.'
    )
    expect(description.closest('.truncate')).toBeNull()
    expect(description.closest('td')).toHaveClass('whitespace-normal')
  })

  it('hides the type and default columns below sm and repeats them under the name', () => {
    render(<ParamTable params={[...PARAMS]} />)

    expect(screen.getByRole('columnheader', { name: 'Type' })).toHaveClass(
      'hidden',
      'sm:table-cell'
    )
    expect(screen.getByRole('columnheader', { name: 'Default' })).toHaveClass(
      'hidden',
      'sm:table-cell'
    )
    const nameCell = screen.getByText('temperature').closest('td')
    const mobileMeta = nameCell?.querySelector('.sm\\:hidden')
    expect(mobileMeta).toHaveTextContent('number')
    expect(mobileMeta).toHaveTextContent('1')
  })

  it('marks only required parameters with the required badge', () => {
    render(<ParamTable params={[...PARAMS]} />)

    expect(screen.getAllByText('required')).toHaveLength(1)
  })
})
