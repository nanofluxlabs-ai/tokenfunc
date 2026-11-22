import { EyeOff, Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { RETENTION_DISCARDED, RETENTION_KEPT } from '../../content'
import { Eyebrow, Panel } from '../landing-primitives'

/** 数据安全：单次请求两列对照，左列正文不存储，右列只存计费元数据 */
export function RetentionCard() {
  const { t } = useTranslation()
  return (
    <Panel>
      <div className='border-border flex flex-wrap justify-between gap-3 border-b px-5 py-4'>
        <Eyebrow>{t('Per request · what we keep')}</Eyebrow>
        <span className='text-muted-foreground font-mono text-xs'>
          req_8f2a…c41
        </span>
      </div>
      <div className='grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))]'>
        <div className='border-border flex flex-col gap-3.5 border-b p-5 sm:border-r sm:border-b-0'>
          <span className='text-foreground inline-flex items-center gap-2 text-[13px]'>
            <EyeOff
              className='text-muted-foreground size-3.5'
              aria-hidden='true'
            />
            {t('Not stored · discarded after use')}
          </span>
          <div className='flex flex-col gap-2'>
            {RETENTION_DISCARDED.map((row) => (
              <div
                key={row.field}
                className='border-input flex justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5 whitespace-nowrap'
              >
                <span className='text-muted-foreground font-mono text-[13px] line-through'>
                  {row.field}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {t(row.label)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className='flex flex-col gap-3.5 p-5'>
          <span className='text-foreground inline-flex items-center gap-2 text-[13px]'>
            <Receipt className='text-brand-ink size-3.5' aria-hidden='true' />
            {t('Billing metadata only')}
          </span>
          <div className='border-border flex flex-col border-t'>
            {RETENTION_KEPT.map((row) => (
              <div
                key={row.field}
                className='border-border flex justify-between gap-3 border-b py-2.5 last:border-b-0'
              >
                <span className='text-foreground font-mono text-[13px]'>
                  {row.field}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {t(row.label)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className='border-border bg-background text-muted-foreground flex flex-wrap justify-between gap-3 border-t px-5 py-3.5 font-mono text-xs'>
        <span>{t('Stored request / response content')}</span>
        <span className='text-brand-ink'>0 B</span>
      </div>
    </Panel>
  )
}
