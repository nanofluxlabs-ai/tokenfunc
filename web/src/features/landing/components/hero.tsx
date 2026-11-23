import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { HERO_PHRASES, HERO_PHRASES_SUMMARY, HERO_TITLE } from '../content'
import { useTypewriter } from '../hooks/use-typewriter'
import { CompatibleTools } from './compatible-tools'

/** 中日文标题短，可以用更大的字号单行放下；其余语言标题较长，字号小一档并允许折行 */
function isCompactScript(language: string | undefined): boolean {
  return /^(zh|ja)/i.test(language ?? '')
}

/**
 * 首屏：小标签 → 固定卖点标题 → 打字机轮播副句 → 副标题 → 两个 CTA → 兼容工具滚动条。
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

        <div className='flex max-w-full flex-col items-center gap-[clamp(14px,2vw,24px)]'>
          <h1
            className={cn(
              'text-foreground m-0 max-w-full font-medium tracking-[-0.05em] text-balance',
              compact
                ? 'text-[clamp(28px,7.2vw,88px)]'
                : 'text-[clamp(30px,5.6vw,68px)]',
              // 行高放在字号之后：tailwind-merge 会让后出现的字号类覆盖前面的 leading
              'leading-[1.1]'
            )}
          >
            {t(HERO_TITLE)}
          </h1>

          {/* 可视的打字区对辅助技术隐藏，完整内容由下面的 sr-only 句子提供 */}
          <p
            aria-hidden='true'
            data-testid='hero-typed'
            className={cn(
              'text-brand-ink m-0 max-w-full text-[clamp(16px,2.6vw,30px)] leading-[1.3] font-medium tracking-[-0.02em] text-balance',
              // 定最小高度：回删到空时下方内容不跳动；西文手机端可能折两行
              compact ? 'min-h-[1.3em]' : 'min-h-[2.6em] sm:min-h-[1.3em]'
            )}
          >
            {typed}
            <span className='bg-primary tf-blink ml-[0.08em] inline-block h-[0.84em] w-[0.06em] rounded-[2px] align-[-0.08em]' />
          </p>
          <p className='sr-only'>{t(HERO_PHRASES_SUMMARY)}</p>
        </div>

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
