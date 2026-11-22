import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TYPEWRITER_TIMING, useTypewriter } from '../hooks/use-typewriter'

const PHRASES = ['AB', 'XYZ'] as const
const originalMatchMedia = window.matchMedia

function mockReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

describe('useTypewriter', () => {
  it('shows the first phrase in full, holds, erases, then types the next phrase', () => {
    mockReducedMotion(false)
    const { result } = renderHook(() => useTypewriter(PHRASES))
    expect(result.current).toBe('AB')

    act(() => vi.advanceTimersByTime(TYPEWRITER_TIMING.firstHold - 1))
    expect(result.current).toBe('AB')

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('A')

    // 删到空，再等间隔后打出第二句第一个字
    act(() => vi.advanceTimersByTime(TYPEWRITER_TIMING.erase))
    expect(result.current).toBe('')
    act(() => vi.advanceTimersByTime(TYPEWRITER_TIMING.gap))
    expect(result.current).toBe('X')
    act(() => vi.advanceTimersByTime(TYPEWRITER_TIMING.type * 2))
    expect(result.current).toBe('XYZ')

    // 打完后停留 hold 才开始回删
    act(() => vi.advanceTimersByTime(TYPEWRITER_TIMING.hold - 1))
    expect(result.current).toBe('XYZ')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('XY')
  })

  it('switches whole phrases on a fixed interval when reduced motion is preferred', () => {
    mockReducedMotion(true)
    const { result } = renderHook(() => useTypewriter(PHRASES))
    expect(result.current).toBe('AB')

    act(() => vi.advanceTimersByTime(TYPEWRITER_TIMING.reducedSwitch - 1))
    expect(result.current).toBe('AB')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('XYZ')
    act(() => vi.advanceTimersByTime(TYPEWRITER_TIMING.reducedSwitch))
    expect(result.current).toBe('AB')
  })

  it('stops scheduling updates after unmount', () => {
    mockReducedMotion(false)
    const { unmount } = renderHook(() => useTypewriter(PHRASES))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
