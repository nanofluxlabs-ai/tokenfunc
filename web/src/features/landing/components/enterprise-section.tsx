import { FileCheck, Headset, Server } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  ENTERPRISE_SERVICES,
  MANAGEMENT_TABS,
  type ManagementTab,
} from '../content'
import { useReveal } from '../hooks/use-reveal'
import {
  CheckList,
  PillTabs,
  Section,
  SectionHeading,
} from './landing-primitives'

const SERVICE_ICONS = {
  'file-check': FileCheck,
  server: Server,
  headset: Headset,
} as const

/** 财务对账表里状态列的着色 */
function statusClass(value: string): string {
  if (value === 'Settled') return 'text-brand-ink'
  if (value === 'Awaiting invoice') return 'text-warning'
  return 'text-foreground/90'
}

function ManagementPanel(props: { tab: ManagementTab }) {
  const { t } = useTranslation()
  return (
    <div className='border-border grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] overflow-hidden rounded-xl border'>
      <div className='bg-background border-border flex flex-col gap-5 border-b p-8 md:border-r md:border-b-0'>
        <span className='text-foreground text-2xl tracking-[-0.3px]'>
          {t(props.tab.title)}
        </span>
        <span className='text-foreground/90 text-sm leading-[22px] text-pretty'>
          {t(props.tab.description)}
        </span>
        <CheckList
          className='border-border border-t pt-5'
          items={props.tab.points.map((point) => t(point))}
        />
      </div>
      <div className='bg-card min-w-0 overflow-x-auto'>
        <table className='w-full border-collapse sm:min-w-[520px]'>
          <thead>
            <tr className='bg-muted'>
              {props.tab.columns.map((column) => (
                <th
                  key={column}
                  className='text-muted-foreground px-3 py-3 text-left font-mono text-xs font-normal tracking-[1.2px] uppercase first:w-[35%] sm:px-6'
                >
                  {t(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.tab.rows.map((row) => (
              <tr
                key={row.join('|')}
                className='border-border hover:bg-foreground/5 border-t'
              >
                {row.map((cell, index) => (
                  <td
                    key={props.tab.columns[index]}
                    className={cn(
                      'px-3 py-4 sm:px-6',
                      index === 0
                        ? 'text-foreground text-sm'
                        : 'font-mono text-[13px]',
                      index === 3
                        ? statusClass(cell)
                        : index > 0 && 'text-foreground/90'
                    )}
                  >
                    {/[A-Za-z]/.test(cell) ? t(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function EnterpriseSection() {
  const { t } = useTranslation()
  const [tabKey, setTabKey] = useState<ManagementTab['key']>('org')
  const tab =
    MANAGEMENT_TABS.find((item) => item.key === tabKey) ?? MANAGEMENT_TABS[0]
  const ref = useReveal<HTMLDivElement>()

  return (
    <Section id='enterprise'>
      <div ref={ref} className='tf-reveal flex flex-col gap-10'>
        <div className='flex flex-wrap items-end justify-between gap-6'>
          <SectionHeading
            className='max-w-[620px]'
            eyebrow={t('Enterprise')}
            title={t('From org chart to invoices, one console runs it all')}
          />
          <PillTabs
            aria-label={t('Management area')}
            value={tabKey}
            onValueChange={setTabKey}
            items={MANAGEMENT_TABS.map((item) => ({
              value: item.key,
              label: t(item.label),
            }))}
          />
        </div>
        <ManagementPanel tab={tab} />
        <div className='bg-border border-border grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-px overflow-hidden rounded-xl border'>
          {ENTERPRISE_SERVICES.map((service) => {
            const Icon = SERVICE_ICONS[service.icon]
            return (
              <div
                key={service.title}
                className='bg-background flex flex-col gap-3 p-7'
              >
                <Icon className='text-foreground size-5' aria-hidden='true' />
                <span className='text-foreground text-lg tracking-[-0.3px]'>
                  {t(service.title)}
                </span>
                <span className='text-muted-foreground text-sm leading-[22px]'>
                  {t(service.description)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}
