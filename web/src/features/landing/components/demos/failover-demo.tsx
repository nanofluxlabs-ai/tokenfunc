import { ZapOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { FAILOVER_CHANNELS } from '../../content'
import { Panel } from '../landing-primitives'

type LogLine = {
  time: string
  code: string
  tone: 'ok' | 'warn' | 'error'
  message: string
}

const TONE_CLASS = {
  ok: 'text-primary',
  warn: 'text-warning',
  error: 'text-destructive',
} as const

/** 供应稳定：模拟号池故障时的自动切换（演示，不发请求） */
export function FailoverDemo() {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const [primary, standby] = FAILOVER_CHANNELS

  const logs: LogLine[] = failed
    ? [
        {
          time: '14:02:11.204',
          code: '503',
          tone: 'error',
          message: `${t(primary.name)} · upstream_unavailable`,
        },
        {
          time: '14:02:11.219',
          code: 'RETRY',
          tone: 'warn',
          message: `→ ${t(standby.name)}`,
        },
        {
          time: '14:02:11.655',
          code: '200',
          tone: 'ok',
          message: `${standby.latency}ms · ${t('transparent to the caller')}`,
        },
      ]
    : [
        {
          time: '14:02:11.204',
          code: '200',
          tone: 'ok',
          message: `${t(primary.name)} · ${primary.latency}ms`,
        },
      ]

  return (
    <div className='flex flex-col gap-5'>
      <Panel>
        <div className='border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4'>
          <span className='text-foreground font-mono text-sm'>
            claude-sonnet-4.5
          </span>
          <span className='text-muted-foreground font-mono text-xs'>
            {t('{{count}} pools · automatic failover', {
              count: FAILOVER_CHANNELS.length,
            })}
          </span>
        </div>
        {FAILOVER_CHANNELS.map((channel, index) => {
          const dead = failed && index === 0
          const active = failed ? index === 1 : index === 0
          let badge = t('Standby')
          if (dead) badge = `${t('Error')} · 503`
          else if (active) badge = t('Current route')
          return (
            <div
              key={channel.name}
              className={cn(
                'border-border grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-4 border-b px-5 py-4 transition-colors duration-300',
                active && 'bg-foreground/5'
              )}
            >
              <span className='text-muted-foreground font-mono text-xs'>
                0{index + 1}
              </span>
              <div className='flex min-w-0 flex-col gap-1'>
                <span className='text-foreground text-[15px]'>
                  {t(channel.name)}
                </span>
                <span className='text-muted-foreground font-mono text-xs'>
                  {t(channel.size)} · {channel.latency}ms ·{' '}
                  {channel.availability}
                </span>
              </div>
              <span
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-xs whitespace-nowrap',
                  dead && 'bg-destructive/10 text-destructive',
                  active && 'bg-foreground text-background',
                  !dead && !active && 'bg-foreground/5 text-muted-foreground'
                )}
              >
                <span
                  className='size-1.5 rounded-full bg-current'
                  aria-hidden='true'
                />
                {badge}
              </span>
            </div>
          )
        })}
        <div
          className='bg-background flex min-h-[104px] flex-col gap-1.5 px-5 py-4'
          aria-live='polite'
        >
          {logs.map((line) => (
            <div
              key={`${line.time}-${line.code}`}
              className='text-muted-foreground flex flex-wrap gap-3.5 font-mono text-xs leading-[18px]'
            >
              <span>{line.time}</span>
              <span className={cn('min-w-8', TONE_CLASS[line.tone])}>
                {line.code}
              </span>
              <span className='text-foreground/90'>{line.message}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Button
        variant='outline'
        size='sm'
        className='h-10 w-fit px-4 text-sm'
        onClick={() => setFailed((current) => !current)}
        aria-pressed={failed}
      >
        <ZapOff aria-hidden='true' />
        {failed ? t('Restore the pool') : t('Simulate a pool failure')}
      </Button>
    </div>
  )
}
