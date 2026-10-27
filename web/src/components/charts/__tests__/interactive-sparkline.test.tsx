import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import { InteractiveSparkline } from '../interactive-sparkline'

const points = [
  { label: '10-25', value: 10 },
  { label: '10-26', value: 30 },
  { label: '10-27', value: 20 },
]
const format = (value: number) => `$${value}`

/** jsdom 没有布局，给图表区一个固定的 300px 宽度，指针坐标才能换算成数据点 */
function stubWidth(element: HTMLElement) {
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 300,
      height: 32,
      right: 300,
      bottom: 32,
    }) as DOMRect
}

describe('InteractiveSparkline', () => {
  test('pointer over the middle of a line shows that point label and value', () => {
    render(
      <InteractiveSparkline points={points} format={format} ariaLabel='Spend' />
    )
    const chart = screen.getByRole('img', { name: 'Spend' })
    stubWidth(chart)

    fireEvent.pointerMove(chart, { clientX: 150 })

    expect(screen.getByRole('status')).toHaveTextContent('10-26 · $30')
  })

  test('pointer over a bar picks the bar under the pointer', () => {
    render(
      <InteractiveSparkline
        points={points}
        format={format}
        variant='bars'
        ariaLabel='Spend'
      />
    )
    const chart = screen.getByRole('img', { name: 'Spend' })
    stubWidth(chart)

    fireEvent.pointerMove(chart, { clientX: 290 })

    expect(screen.getByRole('status')).toHaveTextContent('10-27 · $20')
  })

  test('leaving the chart hides the tooltip', () => {
    render(
      <InteractiveSparkline points={points} format={format} ariaLabel='Spend' />
    )
    const chart = screen.getByRole('img', { name: 'Spend' })
    stubWidth(chart)
    fireEvent.pointerMove(chart, { clientX: 0 })

    fireEvent.pointerLeave(chart)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('focus starts at the latest point and arrow keys move between points', async () => {
    const user = userEvent.setup()
    render(
      <InteractiveSparkline points={points} format={format} ariaLabel='Spend' />
    )

    await user.tab()
    expect(screen.getByRole('status')).toHaveTextContent('10-27 · $20')

    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('status')).toHaveTextContent('10-25 · $10')
  })

  test('is not focusable when placed inside a card link', () => {
    render(
      <InteractiveSparkline
        points={points}
        format={format}
        ariaLabel='Spend'
        focusable={false}
      />
    )

    expect(screen.getByRole('img', { name: 'Spend' })).not.toHaveAttribute(
      'tabindex'
    )
  })

  test('renders an empty placeholder without data and a single point without errors', () => {
    const { rerender, container } = render(
      <InteractiveSparkline points={[]} format={format} ariaLabel='Spend' />
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')

    rerender(
      <InteractiveSparkline
        points={[{ label: '10-27', value: 5 }]}
        format={format}
        ariaLabel='Spend'
      />
    )
    expect(screen.getByRole('img', { name: 'Spend' })).toBeInTheDocument()
  })
})
