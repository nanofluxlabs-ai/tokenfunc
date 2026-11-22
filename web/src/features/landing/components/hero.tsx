import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { type CSSProperties, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { HERO_PHRASES } from '../content'
import { useHeroTitleMetrics } from '../hooks/use-hero-title-metrics'
import { useTypewriter } from '../hooks/use-typewriter'
import { CompatibleTools } from './compatible-tools'

/** 中日文卖点短，640px 起就能与前缀同行；其余语言卖点较长，768px 起才单行 */
function isCompactScript(language: string | undefined): boolean {
  return /^(zh|ja)/i.test(language ?? '')
}

/** 单行时的字号：按实测的单行总宽缩放，封顶 100px（中日文 ≥640px、其余 ≥768px 单行） */
const SINGLE_LINE_FONT = {
  compact:
    'sm:text-[length:min(100px,calc((100vw_-_48px)/var(--hero-line-em)))]',
  wide: 'md:text-[length:min(100px,calc((100vw_-_48px)/var(--hero-line-em)))]',
}

/**
 * 首屏：小标签 → 打字机标题 → 副标题 → 两个 CTA → 兼容工具滚动条。
 * 首屏不出现任何数字；高度不锁一屏，桌面下沿露出 01 卖点的顶部。
 */
export function Hero(props: { registerEnabled: boolean }) {
  const { t, i18n } = useTranslation()
  // 短语数组必须在语言不变时保持同一引用，否则打字机 effect 每次渲染都会重启
  const phrases = useMemo(
    () => HERO_PHRASES.map((phrase) => t(phrase)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.resolvedLanguage]
  )
  const typed = useTypewriter(phrases)
  const compact = isCompactScript(i18n.resolvedLanguage)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const metrics = useHeroTitleMetrics(titleRef, t('TokenFunc,'), phrases)

  return (
    <section id='top' className='relative overflow-hidden'>
      <div className='tf-glow-horizon absolute inset-0' aria-hidden='true' />
      <div className='relative mx-auto flex max-w-[1440px] flex-col items-center gap-7 px-[clamp(20px,5vw,32px)] pt-[calc(4rem_+_clamp(72px,10vw,120px))] pb-[clamp(56px,7vw,88px)] text-center'>
        <span className='border-input text-foreground/90 inline-flex h-[30px] items-center gap-2 rounded-full border px-3.5 text-[13px] whitespace-nowrap'>
          <span
            aria-hidden='true'
            className='bg-primary size-1.5 rounded-full'
          />
          {t('Enterprise AI model gateway')}
        </span>

        <h1
          ref={titleRef}
          aria-label={t(
            'TokenFunc, real models at full strength, zero content retention, and bills that reconcile line by line'
          )}
          style={
            {
              '--hero-line-em': metrics.lineEm,
              '--hero-typed-em': metrics.typedEm,
            } as CSSProperties
          }
          className={cn(
            'text-foreground m-0 flex max-w-full flex-col items-center font-medium tracking-[-0.05em]',
            // 单行：字号随视口缩放，保证「前缀 + 最长卖点」整行放得下
            compact
              ? cn(
                  'text-[length:min(64px,calc((100vw_-_48px)/var(--hero-typed-em)))] sm:flex-row sm:items-baseline sm:justify-center sm:whitespace-nowrap',
                  SINGLE_LINE_FONT.compact
                )
              : cn(
                  // 西文逗号不带间距，同行时补一个词距（已计入 lineEm）
                  'text-[clamp(40px,10vw,64px)] md:flex-row md:items-baseline md:justify-center md:gap-x-[0.25em] md:whitespace-nowrap',
                  SINGLE_LINE_FONT.wide
                ),
            // 行高放在字号之后：tailwind-merge 会让后出现的字号类覆盖前面的 leading
            'leading-[1.1]'
          )}
        >
          <span aria-hidden='true'>{t('TokenFunc,')}</span>
          <span
            aria-hidden='true'
            className={cn(
              'text-brand-ink inline-block tracking-[-0.03em]',
              compact
                ? 'w-[calc(var(--hero-typed-em)*1em)] text-left whitespace-nowrap'
                : // 手机两行时英文等卖点较长，缩小并允许折行；≥768px 与前缀同行、定宽不换行
                  'min-h-[1.2em] max-w-[18em] text-[0.56em] leading-[1.2] text-balance md:w-[calc(var(--hero-typed-em)*1em)] md:max-w-none md:text-left md:text-[1em] md:leading-[1.1] md:whitespace-nowrap'
            )}
          >
            {typed}
            <span className='bg-primary tf-blink ml-[0.08em] inline-block h-[0.84em] w-[0.06em] rounded-[2px] align-[-0.08em]' />
          </span>
        </h1>

        <p className='text-foreground/90 m-0 max-w-[680px] text-lg leading-[30px] text-balance'>
          {t(
            'Multi-source supply for Claude, GPT, Gemini and Grok, with every source labeled. No downgrades, no swaps, no storage of your requests or responses — one console from org setup to billing.'
          )}
        </p>

        <div className='mt-2 flex flex-wrap justify-center gap-3'>
          <Button
            size='lg'
            className='h-12 rounded-full px-6 text-[15px] font-medium whitespace-nowrap'
            render={<a href='#contact' />}
          >
            {t('Request an enterprise trial')}
            <ArrowRight aria-hidden='true' />
          </Button>
          <Button
            size='lg'
            variant='outline'
            className='h-12 rounded-full px-6 text-[15px] whitespace-nowrap'
            render={
              props.registerEnabled ? (
                <Link to='/sign-up' />
              ) : (
                <a href='#pricing' />
              )
            }
          >
            {props.registerEnabled ? t('Sign up free') : t('View pricing')}
          </Button>
        </div>

        <CompatibleTools />
      </div>
    </section>
  )
}
