import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { CAPABILITIES, type Capability } from '../content'
import { useReveal } from '../hooks/use-reveal'
import { BudgetBillCard } from './demos/budget-bill-card'
import { RetentionCard } from './demos/retention-card'
import { SelfCheckDemo } from './demos/self-check-demo'
import { DotList } from './landing-primitives'

const DEMOS: Record<Capability['id'], () => ReactElement> = {
  fidelity: SelfCheckDemo,
  privacy: RetentionCard,
  control: BudgetBillCard,
}

/**
 * 单个主卖点：文案 + demo。偶数块（02）文案在右，用 row-reverse + flex-wrap 实现，
 * 这样手机端换行后仍是文案在上、demo 在下。
 */
function CapabilityBlock(props: { capability: Capability; reversed: boolean }) {
  const { t } = useTranslation()
  const ref = useReveal<HTMLDivElement>()
  const Demo = DEMOS[props.capability.id]
  return (
    <section
      id={props.capability.id}
      className='border-border scroll-mt-16 border-t'
    >
      <div
        ref={ref}
        className={cn(
          'tf-reveal mx-auto flex max-w-[1200px] flex-wrap items-center gap-[clamp(40px,6vw,80px)] px-[clamp(20px,5vw,32px)] py-[clamp(72px,9vw,112px)]',
          props.reversed && 'flex-row-reverse'
        )}
      >
        <div className='flex min-w-0 flex-[1_1_360px] flex-col gap-5'>
          <span className='text-muted-foreground font-mono text-xs leading-[18px] tracking-[1.2px] uppercase'>
            <span className='text-brand-ink'>{props.capability.index}</span> ·{' '}
            {t(props.capability.label)}
          </span>
          <h2 className='text-foreground m-0 text-[clamp(32px,4vw,44px)] leading-[1.15] font-medium tracking-[-0.025em]'>
            {t(props.capability.title)}
          </h2>
          <p className='text-foreground/90 m-0 max-w-[480px] text-base leading-[27px] text-pretty'>
            {t(props.capability.description)}
          </p>
          <DotList
            className='mt-2'
            items={props.capability.points.map((point) => t(point))}
          />
        </div>
        <div className='min-w-0 flex-[1.25_1_420px]'>
          <Demo />
        </div>
      </div>
    </section>
  )
}

/** 三个主卖点：真模型 → 数据安全 → 可对账，桌面左右交替 */
export function Capabilities() {
  return (
    <>
      {CAPABILITIES.map((capability, index) => (
        <CapabilityBlock
          key={capability.id}
          capability={capability}
          reversed={index % 2 === 1}
        />
      ))}
    </>
  )
}
