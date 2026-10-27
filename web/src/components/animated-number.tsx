import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const COUNT_DURATION_SECONDS = 0.8
const EASE_OUT_CUBIC = [0.33, 1, 0.68, 1] as const

type AnimatedNumberProps = {
  value: number
  /** 把数值格式化成最终展示文本；滚动过程中每帧调用，终态即 format(value)，精度与单位语义不变 */
  format: (value: number) => string
  className?: string
}

/**
 * 数字滚动：首次从 0 滚到 value，之后 value 变化时从旧值滚到新值。
 * 文本直接写 DOM，不触发重渲染；系统开启「减少动态效果」时直接显示终值。
 */
export function AnimatedNumber(props: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const currentRef = useRef(reduceMotion ? props.value : 0)
  const animatingRef = useRef(false)
  const formatRef = useRef(props.format)
  // 初始文本只算一次；之后的变化都由下面的 effect 写入 DOM，避免 React 覆盖动画中的文本
  const [initialText] = useState(() => props.format(currentRef.current))

  // 格式化函数（如切换语言 / 货币）变化时，静止状态下立即按新格式重写当前值
  useLayoutEffect(() => {
    formatRef.current = props.format
    if (!animatingRef.current && ref.current) {
      ref.current.textContent = props.format(currentRef.current)
    }
  })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const target = props.value
    if (reduceMotion || currentRef.current === target) {
      currentRef.current = target
      element.textContent = formatRef.current(target)
      return
    }
    animatingRef.current = true
    const controls = animate(currentRef.current, target, {
      duration: COUNT_DURATION_SECONDS,
      ease: EASE_OUT_CUBIC,
      onUpdate: (latest) => {
        currentRef.current = latest
        element.textContent = formatRef.current(latest)
      },
      onComplete: () => {
        animatingRef.current = false
        currentRef.current = target
        element.textContent = formatRef.current(target)
      },
    })
    return () => {
      controls.stop()
      animatingRef.current = false
    }
  }, [props.value, reduceMotion])

  return (
    <span ref={ref} className={props.className}>
      {initialText}
    </span>
  )
}
