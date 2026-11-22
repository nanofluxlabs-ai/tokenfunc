import { type RefObject, useLayoutEffect, useState } from 'react'

/** 字距：与 Hero 样式一致（前缀 -0.05em，打字区 -0.03em） */
const PREFIX_TRACKING = -0.05
const TYPED_TRACKING = -0.03
/** 光标宽度与左边距，再留一点余量避免贴边 */
const CARET_EM = 0.14
const SLACK_EM = 0.3
/** 西文前缀与卖点之间的词距（与 Hero 的 md:gap-x-[0.25em] 一致）；CJK 全角逗号自带间距 */
const LATIN_GAP_EM = 0.25

function isCjkPrefix(prefix: string): boolean {
  return /[\u3000-\u303f\uff00-\uffef]$/.test(prefix)
}

export type HeroTitleMetrics = {
  /** 打字区定宽（em）：容得下最长的卖点，打字过程中前缀不跳动 */
  typedEm: number
  /** 单行总宽（em）：前缀 + 打字区，用来按视口缩放字号 */
  lineEm: number
}

/** 无法测量（测试环境 / 字体未就绪）时的估算：CJK 1em，其余字符 0.55em */
function estimateEm(text: string): number {
  let em = 0
  for (const char of text) {
    em += /[　-鿿＀-￯]/.test(char) ? 1 : 0.55
  }
  return em
}

function estimate(
  prefix: string,
  phrases: readonly string[]
): HeroTitleMetrics {
  const typedEm = Math.max(...phrases.map(estimateEm)) + CARET_EM + SLACK_EM
  const gap = isCjkPrefix(prefix) ? 0 : LATIN_GAP_EM
  return { typedEm, lineEm: estimateEm(prefix) + gap + typedEm }
}

/** 用 canvas 按元素的实际字体量文字宽度，返回 em；不可用时返回 null */
function measureEm(
  element: HTMLElement,
  texts: readonly string[],
  tracking: number
): number | null {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return null
  const style = window.getComputedStyle(element)
  const size = 100
  context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`
  if ('letterSpacing' in context) {
    context.letterSpacing = `${tracking * size}px`
  }
  const widths = texts.map((text) => context.measureText(text).width)
  const widest = Math.max(...widths)
  return Number.isFinite(widest) && widest > 0 ? widest / size : null
}

/**
 * Hero 标题单行排版的度量：按当前语言实测前缀与最长卖点宽度。
 * 替代「隐藏最长句占位」的做法（某些环境会把隐藏文本显示出来）。
 * 字体加载完成后重新测量一次。
 */
export function useHeroTitleMetrics(
  ref: RefObject<HTMLElement | null>,
  prefix: string,
  phrases: readonly string[]
): HeroTitleMetrics {
  const [metrics, setMetrics] = useState(() => estimate(prefix, phrases))

  useLayoutEffect(() => {
    let cancelled = false
    const update = () => {
      const element = ref.current
      if (cancelled || !element) return
      const prefixEm = measureEm(element, [prefix], PREFIX_TRACKING)
      const phraseEm = measureEm(element, phrases, TYPED_TRACKING)
      if (prefixEm === null || phraseEm === null) {
        setMetrics(estimate(prefix, phrases))
        return
      }
      const typedEm = phraseEm + CARET_EM + SLACK_EM
      const gap = isCjkPrefix(prefix) ? 0 : LATIN_GAP_EM
      setMetrics({ typedEm, lineEm: prefixEm + gap + typedEm })
    }
    update()
    void document.fonts?.ready.then(update)
    return () => {
      cancelled = true
    }
  }, [ref, prefix, phrases])

  return metrics
}
