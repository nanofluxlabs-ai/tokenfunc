import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { HERO_PHRASES, HERO_STATS } from '../content'
import { useTypewriter } from '../hooks/use-typewriter'
import { Eyebrow } from './landing-primitives'

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
      <div className='relative mx-auto flex min-h-svh max-w-[1200px] flex-col items-center justify-center gap-6 px-6 pt-24 pb-12 text-center md:px-8'>
        <Eyebrow>{t('Enterprise model gateway')}</Eyebrow>
        <h1 className='text-foreground m-0 flex flex-wrap items-baseline justify-center gap-x-[0.28em] gap-y-[0.1em] text-[clamp(36px,6.8vw,96px)] leading-[1.1] font-medium tracking-[-0.045em]'>
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
        <p className='text-foreground/90 m-0 mt-4 text-lg leading-7 text-balance md:mt-6'>
          {t(
            'Official direct access to Claude · GPT · Gemini · Grok through one endpoint.'
          )}
        </p>
        <div className='flex flex-wrap justify-center gap-3'>
          <Button
            size='lg'
            className='h-12 px-6 text-[15px]'
            render={<a href='#contact' />}
          >
            {t('Request an enterprise trial')}
            <ArrowUpRight aria-hidden='true' />
          </Button>
          {props.registerEnabled ? (
            <Button
              size='lg'
              variant='outline'
              className='h-12 px-6 text-[15px]'
              render={<Link to='/sign-up' />}
            >
              {t('Sign up free')}
            </Button>
          ) : (
            <Button
              size='lg'
              variant='outline'
              className='h-12 px-6 text-[15px]'
              render={<a href='#pricing' />}
            >
              {t('See pricing')}
            </Button>
          )}
        </div>
        <dl className='bg-border border-border mt-8 grid w-full grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-px overflow-hidden rounded-xl border text-left md:mt-12'>
          {HERO_STATS.map((stat) => (
            <div
              key={stat.label}
              className='bg-background flex flex-col gap-2 p-7'
            >
              <dd className='text-foreground m-0 font-mono text-[40px] leading-none tracking-[-1.6px]'>
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
