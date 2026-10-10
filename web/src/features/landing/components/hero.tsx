import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { HERO_PHRASES, HERO_STATS } from '../content'
import { useTypewriter } from '../hooks/use-typewriter'

/**
 * 首屏：徽章 → 打字机标题 → 副标题 → 两个 CTA，指标行贴在首屏底部。
 * 整块高度锁为一屏，内容在剩余空间里垂直居中。
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
  const longest = phrases.reduce(
    (max, phrase) => (phrase.length > max.length ? phrase : max),
    ''
  )

  return (
    <section
      id='top'
      className='border-border relative overflow-hidden border-b'
    >
      <div className='tf-glow-horizon absolute inset-0' aria-hidden='true' />
      <div className='relative mx-auto flex min-h-svh max-w-[1200px] flex-col px-6 pt-16 md:px-8'>
        <div className='flex flex-1 flex-col items-center justify-center text-center'>
          <a
            href='#capabilities'
            className='border-border bg-foreground/[0.04] text-muted-foreground hover:border-input hover:text-foreground inline-flex items-center gap-3 rounded-full border py-1.5 pr-3 pl-1.5 text-[13px] transition-colors'
          >
            {/* 品牌固定英文标记，不进 i18n */}
            <span className='bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-[0.08em] uppercase'>
              NEW
            </span>
            <span>
              {t(
                'OFFICIAL · direct access to the Claude / GPT / Gemini / Grok vendor channels'
              )}
            </span>
            <ChevronRight className='size-3.5 opacity-60' aria-hidden='true' />
          </a>

          <h1 className='text-foreground m-0 mt-14 flex flex-wrap items-baseline justify-center gap-x-[0.28em] gap-y-[0.1em] text-[clamp(40px,6.8vw,96px)] leading-[1.1] font-bold tracking-[-0.045em] md:mt-16'>
            <span>TokenFunc,</span>
            <span className='text-primary inline-grid text-left font-mono text-[0.9em] font-semibold tracking-[-0.02em] whitespace-nowrap'>
              <span aria-hidden='true' className='invisible [grid-area:1/1]'>
                {longest}
              </span>
              <span className='[grid-area:1/1]' aria-live='polite'>
                {typed}
                <span
                  aria-hidden='true'
                  className='bg-primary tf-blink ml-[0.06em] inline-block h-[0.82em] w-[0.07em] align-[-0.06em]'
                />
              </span>
            </span>
          </h1>

          <p className='text-muted-foreground m-0 mt-16 max-w-[640px] text-lg leading-8 text-balance md:mt-24 md:text-xl md:leading-9'>
            {t(
              'Built for enterprises: official direct access to Anthropic, OpenAI, Google and xAI. Smart routing with automatic failover, 99.95% availability, dedicated deployment on request, secure and stable.'
            )}
          </p>

          <div className='mt-12 flex flex-wrap justify-center gap-4 md:mt-16'>
            <Button
              size='lg'
              className='h-14 px-8 text-base font-semibold'
              render={<a href='#contact' />}
            >
              {t('Request an enterprise trial')}
              <ArrowRight aria-hidden='true' />
            </Button>
            <Button
              size='lg'
              variant='secondary'
              className='border-border h-14 border px-8 text-base font-semibold'
              render={
                props.registerEnabled ? (
                  <Link to='/sign-up' />
                ) : (
                  <a href='#pricing' />
                )
              }
            >
              {props.registerEnabled ? t('Sign up free') : t('See pricing')}
              <ArrowRight aria-hidden='true' />
            </Button>
          </div>
        </div>

        <dl className='border-border mx-auto mt-10 grid w-full max-w-[960px] grid-cols-2 gap-y-8 border-t py-10 text-center md:grid-cols-4'>
          {HERO_STATS.map((stat) => (
            <div key={stat.label} className='flex flex-col gap-2'>
              <dd className='text-foreground m-0 text-4xl leading-none font-bold tracking-[-0.03em] tabular-nums md:text-[40px]'>
                {stat.value}
              </dd>
              <dt className='text-muted-foreground text-[13px]'>
                {t(stat.label)}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
