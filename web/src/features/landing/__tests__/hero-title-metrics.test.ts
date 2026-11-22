import { renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'

import { useHeroTitleMetrics } from '../hooks/use-hero-title-metrics'

const ref = createRef<HTMLElement>()

describe('useHeroTitleMetrics fallback estimate', () => {
  it('sizes the typed area to fit the longest phrase, not the current one', () => {
    const short = renderHook(() =>
      useHeroTitleMetrics(ref, 'TokenFunc,', ['ab'])
    ).result.current
    const long = renderHook(() =>
      useHeroTitleMetrics(ref, 'TokenFunc,', ['ab', 'a much longer phrase'])
    ).result.current
    expect(long.typedEm).toBeGreaterThan(short.typedEm)
  })

  it('adds a word gap after a Latin comma but not after a full-width comma', () => {
    const phrases = ['真模型不降智']
    const latin = renderHook(() =>
      useHeroTitleMetrics(ref, 'TokenFunc,', phrases)
    ).result.current
    const cjk = renderHook(() =>
      useHeroTitleMetrics(ref, 'TokenFunc，', phrases)
    ).result.current
    // 全角逗号按 1em 估算，比西文逗号宽 0.45em；西文额外补 0.25em 词距
    expect(latin.lineEm - latin.typedEm).toBeCloseTo(
      cjk.lineEm - cjk.typedEm - 0.45 + 0.25
    )
  })
})
