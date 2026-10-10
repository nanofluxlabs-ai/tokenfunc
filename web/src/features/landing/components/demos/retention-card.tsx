import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { RETENTION_ROWS } from '../../content'
import { Eyebrow, Panel } from '../landing-primitives'

/** 安全合规：单次请求经过网关后哪些字段会被留存 */
export function RetentionCard() {
  const { t } = useTranslation()
  return (
    <Panel>
      <div className='border-border flex flex-wrap justify-between gap-3 border-b px-5 py-4'>
        <Eyebrow>{t('Single request · retained fields')}</Eyebrow>
        <span className='text-muted-foreground font-mono text-xs'>
          req_8f2a…c41
        </span>
      </div>
      {RETENTION_ROWS.map((row) => (
        <div
          key={row.field}
          className='border-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-5 py-3.5'
        >
          <span className='text-foreground/90 text-sm'>{t(row.field)}</span>
          <span
            className={cn(
              'font-mono text-xs',
              row.kept ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {t(row.note)}
          </span>
        </div>
      ))}
      <div className='bg-background text-muted-foreground px-5 py-3.5 font-mono text-xs leading-[18px]'>
        {t('Body bytes written to disk')}{' '}
        <span className='text-primary'>0 B</span>
      </div>
    </Panel>
  )
}
