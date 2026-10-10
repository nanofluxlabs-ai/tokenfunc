import { useEffect, useRef } from 'react'

/**
 * 元素进入视口后打上 data-revealed，配合 styles/landing.css 的 .tf-reveal 做淡入上浮。
 * 只触发一次；不支持 IntersectionObserver 的环境直接显示。
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      element.dataset.revealed = 'true'
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          ;(entry.target as HTMLElement).dataset.revealed = 'true'
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return ref
}
