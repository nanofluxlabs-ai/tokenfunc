import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { getPricing } from '@/features/pricing/api'
import { cn } from '@/lib/utils'

import { FEATURED_MODELS } from '../content'
import { useReveal } from '../hooks/use-reveal'
import { buildFeaturedRows, formatUsdPerMillion } from '../lib/landing-models'
import { Eyebrow, PillTabs } from './landing-primitives'

/** 空态：/api/pricing 为空、请求失败，或精选模型一个都没上架 */
function PricingEmpty() {
  const { t } = useTranslation()
  return (
    <div className='border-input flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center'>
      <RefreshCw className='text-muted-foreground size-6' aria-hidden='true' />
      <span className='text-foreground text-base'>{t('Syncing prices')}</span>
      <span className='text-muted-foreground max-w-[380px] text-sm leading-[22px]'>
        {t(
          'Fetching the latest upstream prices. Refresh shortly or see the full price list.'
        )}
      </span>
      <Button
        variant='outline'
        size='sm'
        className='mt-2 h-9 rounded-full px-4 text-sm whitespace-nowrap'
        render={<Link to='/pricing' search={{ view: 'table' }} />}
      >
        {t('View full pricing')}
      </Button>
    </div>
  )
}

const CELL = 'px-5 text-right whitespace-nowrap'

/** 价目：厂商 Tab + 精选模型，价格只读 /api/pricing */
export function ModelsSection() {
  const { t } = useTranslation()
  const ref = useReveal<HTMLDivElement>()
  const { data, isError, isLoading } = useQuery({
    queryKey: ['landing', 'pricing'],
    queryFn: getPricing,
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })

  // 只保留接口里至少有一个精选模型的厂商，Tab 顺序与配置一致
  const vendors = useMemo(() => {
    if (!data?.success) return []
    return FEATURED_MODELS.map((vendor) => ({
      vendor,
      rows: buildFeaturedRows(data, vendor),
    })).filter((item) => item.rows.length > 0)
  }, [data])
  const [selected, setSelected] = useState<string>(FEATURED_MODELS[0].key)
  const current =
    vendors.find((item) => item.vendor.key === selected) ?? vendors[0]
  const empty = !isLoading && (isError || !current)

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

        {isLoading && (
          <div
            className='border-border flex flex-col gap-3 rounded-xl border p-5'
            aria-busy='true'
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={`skeleton-${index}`}
                className='bg-muted h-5 w-1/2 animate-pulse rounded'
              />
            ))}
          </div>
        )}

        {empty && <PricingEmpty />}

        {!isLoading && current && (
          <div className='flex flex-col gap-4'>
            <PillTabs
              aria-label={t('Model vendor')}
              value={current.vendor.key}
              onValueChange={setSelected}
              className='w-fit'
              items={vendors.map((item) => ({
                value: item.vendor.key,
                label: (
                  <span className='inline-flex items-center gap-2'>
                    {item.vendor.label}
                    <span className='font-mono text-[11px] opacity-70'>
                      {item.vendor.vendor}
                    </span>
                  </span>
                ),
              }))}
            />
            <div
              role='tabpanel'
              aria-label={current.vendor.label}
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
                    {current.rows.map((row) => (
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
                          {formatUsdPerMillion(row.inputUSD)}
                        </td>
                        <td className={cn(CELL, 'text-brand-ink py-4')}>
                          {formatUsdPerMillion(row.cacheUSD)}
                        </td>
                        <td className={cn(CELL, 'text-foreground/90 py-4')}>
                          {formatUsdPerMillion(row.outputUSD)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className='border-border bg-card text-muted-foreground border-t px-5 py-3 text-xs leading-[18px]'>
                {t(current.vendor.note)}
              </div>
            </div>
          </div>
        )}

        <span className='text-muted-foreground text-[13px]'>
          {t(
            'Per 1M tokens, in USD, synced with official upstream prices. Cached input is billed at the cache price.'
          )}
        </span>
      </div>
    </section>
  )
}
