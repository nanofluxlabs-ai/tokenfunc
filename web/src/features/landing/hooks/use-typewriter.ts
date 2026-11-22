import { useEffect, useState } from 'react'

/** 打字机时序（毫秒），对应设计手册 v3「打字机时序」表 */
export const TYPEWRITER_TIMING = {
  /** 首句直接完整显示后的停留 */
  firstHold: 2400,
  /** 逐字打出 */
  type: 110,
  /** 打完后的停留 */
  hold: 2200,
  /** 逐字回删 */
  erase: 45,
  /** 删空后到下一句开始的间隔 */
  gap: 360,
  /** 减弱动效下整句切换的间隔 */
  reducedSwitch: 3200,
} as const

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
}

/**
 * 首屏标题的打字机效果：首句完整显示 → 停留 → 回删 → 逐字打下一句 → 停留 → 回删……
 * 减弱动效下不逐字打，整句定时切换。组件卸载或短语变化时清理定时器。
 */
export function useTypewriter(phrases: readonly string[]): string {
  const [text, setText] = useState(phrases[0] ?? '')

  useEffect(() => {
    if (phrases.length === 0) return
    let timer = 0
    let index = 0
    setText(phrases[0])

    if (prefersReducedMotion()) {
      if (phrases.length < 2) return
      const interval = window.setInterval(() => {
        index = (index + 1) % phrases.length
        setText(phrases[index])
      }, TYPEWRITER_TIMING.reducedSwitch)
      return () => window.clearInterval(interval)
    }

    let length = phrases[0].length
    let erasing = true

    const tick = () => {
      let wait: number = erasing
        ? TYPEWRITER_TIMING.erase
        : TYPEWRITER_TIMING.type
      if (erasing) {
        length -= 1
        if (length <= 0) {
          length = 0
          erasing = false
          index = (index + 1) % phrases.length
          wait = TYPEWRITER_TIMING.gap
        }
      } else {
        length += 1
        if (length >= phrases[index].length) {
          length = phrases[index].length
          erasing = true
          wait = TYPEWRITER_TIMING.hold
        }
      }
      setText(phrases[index].slice(0, length))
      timer = window.setTimeout(tick, wait)
    }

    timer = window.setTimeout(tick, TYPEWRITER_TIMING.firstHold)
    return () => window.clearTimeout(timer)
  }, [phrases])

  return text
}
