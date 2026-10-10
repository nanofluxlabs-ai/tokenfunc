import { useEffect, useState } from 'react'

const TYPE_DELAY = 110
const DELETE_DELAY = 45
const HOLD_DELAY = 2000
const SWITCH_DELAY = 320

/**
 * 首屏标题的打字机效果：逐字打出一个短语、停留、逐字删除、换下一个。
 * 尊重 prefers-reduced-motion：关闭动效时固定显示第一个短语。
 */
export function useTypewriter(phrases: readonly string[]): string {
  const [text, setText] = useState(phrases[0] ?? '')

  useEffect(() => {
    if (phrases.length === 0) return
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setText(phrases[0])
      return
    }

    let index = 0
    let length = phrases[0].length
    let deleting = false
    let timer = 0

    const tick = () => {
      const phrase = phrases[index]
      let wait = deleting ? DELETE_DELAY : TYPE_DELAY
      if (deleting) {
        length -= 1
        if (length <= 0) {
          length = 0
          deleting = false
          index = (index + 1) % phrases.length
          wait = SWITCH_DELAY
        }
      } else {
        length += 1
        if (length >= phrase.length) {
          length = phrase.length
          deleting = true
          wait = HOLD_DELAY
        }
      }
      setText(phrases[index].slice(0, length))
      timer = window.setTimeout(tick, wait)
    }

    setText(phrases[0])
    timer = window.setTimeout(() => {
      deleting = true
      tick()
    }, HOLD_DELAY + 200)

    return () => window.clearTimeout(timer)
  }, [phrases])

  return text
}
