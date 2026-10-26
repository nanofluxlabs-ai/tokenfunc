import { useTranslation } from 'react-i18next'

import { LATENCY_ROWS } from '../../content'
import { Eyebrow, Panel } from '../landing-primitives'

/** 高性能低延迟：首 token 延迟示意（市场口径数据） */
export function LatencyCard() {
  const { t } = useTranslation()
  return (
    <Panel className='flex flex-col gap-4 p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Eyebrow>{t('First-token latency · last 24h')}</Eyebrow>
        <span className='text-muted-foreground font-mono text-xs'>P50</span>
      </div>
      <div className='border-border flex flex-col border-t'>
        {LATENCY_ROWS.map((row) => (
          <div
            key={row.model}
            className='border-border grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] items-center gap-4 border-b py-3.5'
          >
            <span className='text-foreground font-mono text-[13px]'>
              {row.model}
            </span>
            <div
              className='bg-foreground/15 h-1.5 overflow-hidden rounded-full'
              role='img'
              aria-label={`${row.model} P50 ${row.p50}ms`}
            >
              <div
                className='bg-foreground h-full'
                style={{ width: `${row.width}%` }}
              />
            </div>
            <span className='text-foreground/90 text-right font-mono text-[13px] whitespace-nowrap'>
              {row.p50}ms{' '}
              <span className='text-muted-foreground hidden sm:inline'>
                · P95 {row.p95}ms
              </span>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}
