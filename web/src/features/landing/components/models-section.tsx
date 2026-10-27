import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getPricing } from '@/features/pricing/api'

import { LANDING_VENDORS } from '../content'
import { useReveal } from '../hooks/use-reveal'
import {
  buildLandingModelRows,
  formatUsdPerMillion,
} from '../lib/landing-models'
import { PillTabs, Section, SectionHeading } from './landing-primitives'

const MAX_ROWS = 12

/** 模型价目：直接读系统定价，不写死价格 */
export function ModelsSection() {
  const { t } = useTranslation()
  const [vendor, setVendor] = useState('all')
  const ref = useReveal<HTMLDivElement>()
  const { data, isError, isLoading } = useQuery({
    queryKey: ['landing', 'pricing'],
    queryFn: getPricing,
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })

  const rows = useMemo(
    () => (data?.success ? buildLandingModelRows(data) : []),
    [data]
  )
  const visible = rows
    .filter((row) => vendor === 'all' || row.vendorKey === vendor)
    .slice(0, MAX_ROWS)
  const unavailable =
    isError || (data && !data.success) || (!isLoading && rows.length === 0)

  return (
    <Section id='models'>
      <div ref={ref} className='tf-reveal flex flex-col gap-10'>
        <div className='flex flex-wrap items-end justify-between gap-6'>
          <SectionHeading
            eyebrow={t('Models')}
            title={t('Major overseas models, one price list')}
          />
          <PillTabs
            size='sm'
            aria-label={t('Vendor')}
            value={vendor}
            onValueChange={setVendor}
            items={[
              { value: 'all', label: t('All') },
              ...LANDING_VENDORS.map((item) => ({
                value: item.key,
                label: item.label,
              })),
            ]}
          />
        </div>
        {unavailable ? (
          <div className='border-border text-muted-foreground rounded-lg border px-6 py-10 text-center text-sm'>
            {t('The price list is available in the model square.')}{' '}
            <Link
              to='/pricing'
              className='text-foreground underline underline-offset-4'
            >
              {t('Open model square')}
            </Link>
          </div>
        ) : (
          <div className='border-border overflow-x-auto rounded-lg border'>
            <table className='w-full border-collapse sm:min-w-[720px]'>
              <thead>
                <tr className='bg-muted text-muted-foreground font-mono text-xs tracking-[1.2px] uppercase'>
                  <th className='px-3 py-3 text-left font-normal sm:px-5'>
                    {t('Model')}
                  </th>
                  <th className='hidden px-5 py-3 text-left font-normal sm:table-cell'>
                    {t('Vendor')}
                  </th>
                  <th className='px-3 py-3 text-right font-normal sm:px-5'>
                    {t('Input / 1M')}
                  </th>
                  <th className='hidden px-5 py-3 text-right font-normal sm:table-cell'>
                    {t('Cache read / 1M')}
                  </th>
                  <th className='px-3 py-3 text-right font-normal sm:px-5'>
                    {t('Output / 1M')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 4 }, (_, index) => (
                    <tr key={index} className='border-border border-t'>
                      <td colSpan={5} className='px-5 py-4'>
                        <div className='bg-muted h-4 w-1/2 animate-pulse rounded' />
                      </td>
                    </tr>
                  ))}
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    className='border-border hover:bg-foreground/5 border-t'
                  >
                    <td className='text-foreground px-3 py-4 font-mono text-sm break-all sm:px-5'>
                      {row.id}
                      {/* 手机上厂商列隐藏，挪到模型名下面 */}
                      <span className='text-muted-foreground mt-1 block font-sans text-xs sm:hidden'>
                        {row.vendorLabel}
                      </span>
                    </td>
                    <td className='text-muted-foreground hidden px-5 py-4 text-sm sm:table-cell'>
                      {row.vendorLabel}
                    </td>
                    <td className='text-foreground px-3 py-4 text-right font-mono text-sm sm:px-5'>
                      {formatUsdPerMillion(row.inputUSD)}
                    </td>
                    <td className='text-brand-ink hidden px-5 py-4 text-right font-mono text-sm sm:table-cell'>
                      {formatUsdPerMillion(row.cacheUSD)}
                    </td>
                    <td className='text-foreground/90 px-3 py-4 text-right font-mono text-sm sm:px-5'>
                      {formatUsdPerMillion(row.outputUSD)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <span className='text-muted-foreground text-[13px]'>
          {t(
            'Priced in USD and kept in sync with upstream list prices. Cache hits are billed at the cache price.'
          )}{' '}
          <Link
            to='/pricing'
            className='text-foreground underline underline-offset-4'
          >
            {t('Full price list')}
          </Link>
        </span>
      </div>
    </Section>
  )
}
