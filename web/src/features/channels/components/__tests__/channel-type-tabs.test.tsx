import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChannelTypeTabs } from '../channel-type-tabs'

afterEach(() => {
  cleanup()
})

describe('ChannelTypeTabs', () => {
  it('renders an All tab plus one tab per available type with counts', () => {
    render(
      <ChannelTypeTabs
        value=''
        onValueChange={() => {}}
        availableTypes={[1, 14]}
        typeCounts={{ all: 7, '1': 4, '14': 3 }}
      />
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveTextContent('7')
    expect(tabs[1]).toHaveTextContent('4')
    expect(tabs[2]).toHaveTextContent('3')
  })

  it('emits the type as a string when a provider tab is selected and an empty string for All', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const { rerender } = render(
      <ChannelTypeTabs
        value=''
        onValueChange={onValueChange}
        availableTypes={[1, 14]}
        typeCounts={{ all: 2, '1': 1, '14': 1 }}
      />
    )
    await user.click(screen.getAllByRole('tab')[2]!)
    expect(onValueChange).toHaveBeenLastCalledWith('14')

    rerender(
      <ChannelTypeTabs
        value='14'
        onValueChange={onValueChange}
        availableTypes={[1, 14]}
        typeCounts={{ all: 2, '1': 1, '14': 1 }}
      />
    )
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await user.click(screen.getAllByRole('tab')[0]!)
    expect(onValueChange).toHaveBeenLastCalledWith('')
  })
})
