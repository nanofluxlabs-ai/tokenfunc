import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { HERO_PHRASES } from '../content'
import { useTypewriter } from '../hooks/use-typewriter'
import { CompatibleTools } from './compatible-tools'

/** 中日文卖点短，能与前缀同行；其余语言卖点太长，固定上下两行 */
function isCompactScript(language: string | undefined): boolean {
  return /^(zh|ja)/i.test(language ?? '')
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
          aria-label={t(
            'TokenFunc, real models at full strength, zero content retention, and bills that reconcile line by line'
          )}
          className={cn(
            'text-foreground m-0 flex max-w-full items-center leading-[1.1] font-medium tracking-[-0.05em]',
            compact
              ? // 手机逗号后换行、字号放大；≥640px 单行，字号随视口缩放封顶 100px
                'flex-col text-[length:min(64px,calc((100vw_-_48px)/6.4))] sm:flex-row sm:items-baseline sm:justify-center sm:text-[length:min(100px,calc((100vw_-_48px)/12.4))] sm:whitespace-nowrap'
              : 'flex-col text-[clamp(40px,8vw,100px)]'
          )}
        >
          <span aria-hidden='true'>{t('TokenFunc,')}</span>
          <span
            aria-hidden='true'
            className={cn(
              'text-brand-ink inline-block tracking-[-0.03em]',
              compact
                ? 'w-[6.1em] text-left whitespace-nowrap'
                : 'min-h-[1.2em] max-w-[18em] text-[0.56em] leading-[1.2] text-balance'
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
