import { useTranslation } from 'react-i18next'

import { CAPABILITIES, type Capability } from '../content'
import { useReveal } from '../hooks/use-reveal'
import { CacheBillCard } from './demos/cache-bill-card'
import { FailoverDemo } from './demos/failover-demo'
import { LatencyCard } from './demos/latency-card'
import { RetentionCard } from './demos/retention-card'
import { SelfCheckDemo } from './demos/self-check-demo'
import {
  CheckList,
  Eyebrow,
  Section,
  SectionHeading,
} from './landing-primitives'

const DEMOS: Record<Capability['id'], () => React.ReactElement> = {
  security: RetentionCard,
  fidelity: SelfCheckDemo,
  supply: FailoverDemo,
  performance: LatencyCard,
  cache: CacheBillCard,
}

// 手机上只保留可交互的两个演示，静态示意卡隐藏，避免能力区拉得太长
const MOBILE_DEMOS = new Set<Capability['id']>(['fidelity', 'supply'])

function CapabilityRow(props: { capability: Capability }) {
  const { t } = useTranslation()
  const ref = useReveal<HTMLDivElement>()
  const Demo = DEMOS[props.capability.id]
  return (
    <div
      ref={ref}
      className='tf-reveal border-border grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-8 border-b py-10 last:border-b-0 last:pb-0 sm:gap-12 sm:py-14'
    >
      <div className='flex flex-col gap-5'>
        <Eyebrow>{props.capability.eyebrow}</Eyebrow>
        <h3 className='text-foreground m-0 text-2xl leading-8 font-medium tracking-[-0.6px] sm:text-[32px] sm:leading-10'>
          {t(props.capability.title)}
        </h3>
        <p className='text-foreground/90 m-0 leading-[26px] text-pretty'>
          {t(props.capability.description)}
        </p>
        <CheckList items={props.capability.points.map((point) => t(point))} />
      </div>
      <div
        className={
          MOBILE_DEMOS.has(props.capability.id) ? undefined : 'hidden sm:block'
        }
      >
        <Demo />
      </div>
    </div>
  )
}

export function Capabilities() {
  const { t } = useTranslation()
  return (
    <Section id='capabilities' bordered={false} innerClassName='gap-12'>
      <SectionHeading
        size='display'
        eyebrow={t('Why tokenfunc')}
        title={t('Built for production')}
      />
      <div className='border-border flex flex-col border-t'>
        {CAPABILITIES.map((capability) => (
          <CapabilityRow key={capability.id} capability={capability} />
        ))}
      </div>
    </Section>
  )
}
