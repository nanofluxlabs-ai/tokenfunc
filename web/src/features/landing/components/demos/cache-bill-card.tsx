import { useTranslation } from 'react-i18next'

import { CACHE_BILL } from '../../content'
import { Eyebrow, Panel } from '../landing-primitives'

/** 高缓存命中率：一次请求的账单拆分示意 */
export function CacheBillCard() {
  const { t } = useTranslation()
  const miss = (100 - CACHE_BILL.hitPercent).toFixed(1)
  return (
    <Panel className='flex flex-col gap-5 p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Eyebrow>{t('Bill for one request')}</Eyebrow>
        <span className='text-muted-foreground font-mono text-xs'>
          {CACHE_BILL.model}
        </span>
      </div>
      <div className='flex flex-col gap-2'>
        <div
          className='bg-foreground/15 flex h-2 overflow-hidden rounded-full'
          role='img'
          aria-label={t('Cache hit {{percent}}%', {
            percent: CACHE_BILL.hitPercent,
          })}
        >
          <div
            className='bg-foreground'
            style={{ width: `${CACHE_BILL.hitPercent}%` }}
          />
        </div>
        <div className='text-muted-foreground flex justify-between font-mono text-xs'>
          <span>
            {t('Cache hit {{percent}}%', { percent: CACHE_BILL.hitPercent })}
          </span>
          <span>{t('Miss {{percent}}%', { percent: miss })}</span>
        </div>
      </div>
      <div className='border-border flex flex-col border-t font-mono text-[13px]'>
        {CACHE_BILL.rows.map((row) => (
          <div
            key={row.label}
            className='border-border grid grid-cols-[minmax(0,1.3fr)_1fr_1fr] gap-3 border-b py-3'
          >
            <span className='text-foreground/90 font-sans'>{t(row.label)}</span>
            <span className='text-muted-foreground text-right'>
              {row.tokens}
            </span>
            <span className='text-foreground text-right'>{row.cost}</span>
          </div>
        ))}
        <div className='grid grid-cols-[minmax(0,1.3fr)_1fr_1fr] gap-3 py-3'>
          <span className='text-foreground font-sans'>{t('Total')}</span>
          <span className='text-muted-foreground text-right line-through'>
            {CACHE_BILL.listTotal}
          </span>
          <span className='text-foreground text-right'>{CACHE_BILL.total}</span>
        </div>
      </div>
      <span className='text-muted-foreground text-[13px]'>
        {t('Cache hits saved')}{' '}
        <span className='text-primary font-mono'>
          {CACHE_BILL.savedPercent}
        </span>
        {t(', the struck-through price is the cost without cache.')}
      </span>
    </Panel>
  )
}
