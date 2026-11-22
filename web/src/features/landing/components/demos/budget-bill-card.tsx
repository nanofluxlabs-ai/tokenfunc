import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { BUDGET_DEMO } from '../../content'
import { Eyebrow, Panel } from '../landing-primitives'

const BILL_GRID =
  'grid grid-cols-[minmax(0,1.6fr)_0.8fr_1fr_0.8fr_0.9fr] gap-3 px-5'

/** 可对账：团队预算进度（含 90% 告警阈值线）+ 账单明细（静态演示） */
export function BudgetBillCard() {
  const { t } = useTranslation()
  return (
    <Panel>
      <div className='border-border flex flex-wrap justify-between gap-3 border-b px-5 py-4'>
        <Eyebrow>
          {t('Team budget')} · {BUDGET_DEMO.period}
        </Eyebrow>
        <span className='text-muted-foreground font-mono text-xs'>
          {t('Alert threshold')} {BUDGET_DEMO.thresholdPercent}%
        </span>
      </div>
      <div className='flex flex-col gap-[18px] p-5'>
        {BUDGET_DEMO.teams.map((team) => {
          const near = team.percent >= BUDGET_DEMO.thresholdPercent
          return (
            <div key={team.name} className='flex flex-col gap-2'>
              <div className='flex items-baseline justify-between gap-3'>
                <span className='text-foreground inline-flex items-center gap-2 text-sm'>
                  {t(team.name)}
                  {near && (
                    <span className='bg-warning/15 text-warning inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] whitespace-nowrap'>
                      <span
                        aria-hidden='true'
                        className='size-[5px] rounded-full bg-current'
                      />
                      {t('Near limit')}
                    </span>
                  )}
                </span>
                <span className='text-muted-foreground font-mono text-xs'>
                  <span className={near ? 'text-warning' : 'text-foreground'}>
                    {team.used}
                  </span>{' '}
                  / {team.budget}
                </span>
              </div>
              <div
                role='progressbar'
                aria-label={t(team.name)}
                aria-valuenow={team.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className='bg-muted relative h-1.5 rounded-full'
              >
                <div
                  className={cn(
                    'h-full rounded-full',
                    near ? 'bg-warning' : 'bg-foreground'
                  )}
                  style={{ width: `${team.percent}%` }}
                />
                <span
                  aria-hidden='true'
                  className='bg-muted-foreground absolute -top-[3px] h-3 w-px'
                  style={{ left: `${BUDGET_DEMO.thresholdPercent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className='border-border overflow-x-auto border-t'>
        <div className='min-w-[460px]'>
          <div
            className={cn(
              BILL_GRID,
              'bg-muted text-muted-foreground py-2.5 font-mono text-[11px] tracking-[1px] uppercase'
            )}
          >
            <span>{t('Itemized bill')}</span>
            <span className='text-right'>{t('Input')}</span>
            <span className='text-right'>{t('Cache read')}</span>
            <span className='text-right'>{t('Output')}</span>
            <span className='text-right'>{t('Amount')}</span>
          </div>
          {BUDGET_DEMO.bills.map((bill) => (
            <div
              key={bill.model}
              className={cn(
                BILL_GRID,
                'border-border items-center border-t py-3 font-mono text-[13px]'
              )}
            >
              <span className='flex min-w-0 flex-col'>
                <span className='text-foreground truncate'>{bill.model}</span>
                <span className='text-muted-foreground font-sans text-[11px]'>
                  {t(bill.team)} · {t(bill.owner)} · {bill.key}
                </span>
              </span>
              <span className='text-foreground/90 text-right'>
                {bill.input}
              </span>
              <span className='text-brand-ink text-right'>
                {bill.cacheRead}
              </span>
              <span className='text-foreground/90 text-right'>
                {bill.output}
              </span>
              <span className='text-foreground text-right'>{bill.amount}</span>
            </div>
          ))}
        </div>
      </div>
      <div className='border-border bg-background flex flex-wrap gap-2 border-t px-5 py-3.5'>
        {['Export CSV', 'Prepaid / Monthly', 'VAT invoice'].map((label) => (
          <span
            key={label}
            className='border-input text-foreground/90 inline-flex h-6 items-center rounded-full border px-2.5 text-xs whitespace-nowrap'
          >
            {t(label)}
          </span>
        ))}
      </div>
    </Panel>
  )
}
