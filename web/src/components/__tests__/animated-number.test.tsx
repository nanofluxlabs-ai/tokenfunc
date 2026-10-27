import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { AnimatedNumber } from '../animated-number'

// motion 会在进程内缓存「减少动态效果」的媒体查询结果，测试里直接控制该 hook
const motionState = vi.hoisted(() => ({ reduce: true }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motionState.reduce,
}))

const formatUsd = (value: number) => `$${value.toFixed(2)}`

afterEach(() => {
  motionState.reduce = true
})

describe('AnimatedNumber', () => {
  test('shows the formatted final value at once when reduced motion is preferred', () => {
    render(<AnimatedNumber value={12.5} format={formatUsd} />)

    expect(screen.getByText('$12.50')).toBeInTheDocument()
  })

  test('shows the new formatted value after the value changes', () => {
    const { rerender } = render(
      <AnimatedNumber value={12.5} format={formatUsd} />
    )

    rerender(<AnimatedNumber value={30} format={formatUsd} />)

    expect(screen.getByText('$30.00')).toBeInTheDocument()
  })

  test('counts up from zero and lands exactly on the formatted value', async () => {
    motionState.reduce = false

    render(<AnimatedNumber value={42} format={formatUsd} />)

    expect(screen.queryByText('$42.00')).not.toBeInTheDocument()
    expect(await screen.findByText('$42.00')).toBeInTheDocument()
  })
})
