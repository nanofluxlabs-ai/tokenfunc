import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { FEATURED_MODELS } from '../content'
import { useReveal } from '../hooks/use-reveal'
import { formatUsdPerMillion } from '../lib/landing-models'
import { Eyebrow, PillTabs } from './landing-primitives'

const CELL = 'px-5 text-right whitespace-nowrap'

/** 价目：厂商 Tab + 各家最新主流模型，价格为 content.ts 里的静态官方价 */
export function ModelsSection() {
  const { t } = useTranslation()
  const ref = useReveal<HTMLDivElement>()
  const [selected, setSelected] = useState<string>(FEATURED_MODELS[0].key)
  const current =
    FEATURED_MODELS.find((vendor) => vendor.key === selected) ??
    FEATURED_MODELS[0]

  return (
    <section id='pricing' className='border-border scroll-mt-16 border-t'>
      <div
        ref={ref}
        className='tf-reveal mx-auto flex max-w-[1200px] flex-col gap-8 px-[clamp(20px,5vw,32px)] py-[clamp(72px,9vw,112px)]'
      >
        <div className='flex flex-wrap items-end justify-between gap-6'>
          <div className='flex flex-col gap-4'>
            <Eyebrow>{t('Pricing')}</Eyebrow>
            <h2 className='text-foreground m-0 text-[clamp(28px,3.4vw,36px)] leading-[1.2] font-medium tracking-[-0.02em]'>
              {t('Leading global models, one price list')}
            </h2>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              className='h-10 rounded-full px-[18px] text-sm whitespace-nowrap'
              render={<Link to='/pricing' search={{ view: 'table' }} />}
            >
              {t('Full pricing')}
            </Button>
            <Button
              variant='ghost'
              className='h-10 rounded-full px-[18px] text-sm whitespace-nowrap'
              render={<Link to='/pricing' />}
            >
              {t('Open model hub')}
              <ArrowRight aria-hidden='true' />
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-4'>
          <PillTabs
            aria-label={t('Model vendor')}
            value={current.key}
            onValueChange={setSelected}
            className='w-fit'
            items={FEATURED_MODELS.map((vendor) => ({
              value: vendor.key,
              label: (
                <span className='inline-flex items-center gap-2'>
                  {vendor.label}
                  <span className='font-mono text-[11px] opacity-70'>
                    {vendor.vendor}
                  </span>
                </span>
              ),
            }))}
          />
          <div
            role='tabpanel'
            aria-label={current.label}
            className='border-border overflow-hidden rounded-xl border'
          >
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[600px] border-collapse font-mono text-sm'>
                <thead>
                  <tr className='bg-muted text-muted-foreground text-xs tracking-[1px] uppercase'>
                    <th className='bg-muted sticky left-0 z-10 px-5 py-3 text-left font-normal'>
                      {t('Model')}
                    </th>
                    <th className={cn(CELL, 'py-3 font-normal')}>
                      {t('Input')}
                    </th>
                    <th className={cn(CELL, 'py-3 font-normal')}>
                      {t('Cache read')}
                    </th>
                    <th className={cn(CELL, 'py-3 font-normal')}>
                      {t('Output')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {current.models.map((row) => (
                    <tr
                      key={row.id}
                      className='border-border group hover:bg-foreground/5 border-t'
                    >
                      <td className='bg-background group-hover:bg-muted sticky left-0 z-10 px-5 py-4'>
                        <span className='flex items-center gap-2.5'>
                          <span className='text-foreground whitespace-nowrap'>
                            {row.id}
                          </span>
                          <span className='border-input text-muted-foreground inline-flex h-5 flex-none items-center rounded-full border px-2 font-sans text-[11px] whitespace-nowrap'>
                            {t(row.tag)}
                          </span>
                        </span>
                      </td>
                      <td className={cn(CELL, 'text-foreground py-4')}>
                        {formatUsdPerMillion(row.price.input)}
                      </td>
                      <td className={cn(CELL, 'text-brand-ink py-4')}>
                        {formatUsdPerMillion(row.price.cacheRead)}
                      </td>
                      <td className={cn(CELL, 'text-foreground/90 py-4')}>
                        {formatUsdPerMillion(row.price.output)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className='border-border bg-card text-muted-foreground border-t px-5 py-3 text-xs leading-[18px]'>
              {t(current.note)}
            </div>
          </div>
        </div>

        <span className='text-muted-foreground text-[13px]'>
          {t(
            'Per 1M tokens, in USD, synced with official upstream prices. Cached input is billed at the cache price.'
          )}
        </span>
      </div>
    </section>
  )
}
