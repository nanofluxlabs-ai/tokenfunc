import {
  Activity,
  BadgeCheck,
  Database,
  DatabaseZap,
  Gauge,
  Layers,
  Link2,
  Receipt,
  Rocket,
  ShieldCheck,
  Timer,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { QUALITY_CARDS, QUALITY_METRICS, type QualityCard } from '../content'
import { useReveal } from '../hooks/use-reveal'
import { Eyebrow } from './landing-primitives'

const CARD_ICONS: Record<QualityCard['id'], LucideIcon> = {
  supply: ShieldCheck,
  cache: DatabaseZap,
  performance: Rocket,
}

/** 小标签：图标 + 文字，标签组 flex-wrap，标签本身不换行 */
function Tag(props: { icon: LucideIcon; children: ReactNode }) {
  const Icon = props.icon
  return (
    <span className='border-border text-foreground/90 flex h-[34px] items-center gap-2 rounded-lg border px-3 text-[13px] whitespace-nowrap'>
      <Icon className='text-brand-ink size-3.5 flex-none' aria-hidden='true' />
      {props.children}
    </span>
  )
}

function BigNumber(props: { value: string; label: string; accent?: boolean }) {
  return (
    <div className='flex items-baseline gap-2.5'>
      <span
        className={
          props.accent
            ? 'text-brand-ink font-mono text-5xl leading-none tracking-[-2px]'
            : 'text-foreground font-mono text-5xl leading-none tracking-[-2px]'
        }
      >
        {props.value}
      </span>
      <span className='text-muted-foreground text-sm'>{props.label}</span>
    </div>
  )
}

function SupplyBody() {
  const { t } = useTranslation()
  return (
    <>
      <BigNumber
        value={QUALITY_METRICS.admissionChecks}
        label={t('channel admission checks')}
      />
      <div className='flex flex-wrap gap-2'>
        <Tag icon={BadgeCheck}>{t('Authenticity')}</Tag>
        <Tag icon={Activity}>{t('Stability')}</Tag>
        <Tag icon={Zap}>{t('Performance')}</Tag>
        <Tag icon={Database}>{t('Cache hit rate')}</Tag>
      </div>
    </>
  )
}

function CacheBody() {
  const { t } = useTranslation()
  return (
    <>
      <BigNumber
        accent
        value={QUALITY_METRICS.cacheHitRate}
        label={t('cache hits on long sessions')}
      />
      <div className='flex flex-col gap-2'>
        <div className='bg-muted flex h-2 overflow-hidden rounded-full'>
          <div
            className='bg-primary'
            style={{ width: `${QUALITY_METRICS.cacheHitBarPercent}%` }}
          />
        </div>
        <div className='text-muted-foreground flex justify-between font-mono text-xs'>
          <span className='inline-flex items-center gap-1.5'>
            <span aria-hidden='true' className='bg-primary size-2 rounded-xs' />
            {t('Cache reads')}
          </span>
          <span className='inline-flex items-center gap-1.5'>
            <span aria-hidden='true' className='bg-muted size-2 rounded-xs' />
            {t('Misses')}
          </span>
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Tag icon={Link2}>{t('Session-affinity routing')}</Tag>
        <Tag icon={Receipt}>{t('Cache reads billed at cache price')}</Tag>
      </div>
    </>
  )
}

function PerformanceBody() {
  const { t } = useTranslation()
  // 指标缩写是技术术语，不进 i18n
  const rows: {
    icon: LucideIcon
    name: string
    label: string
    value: string
    unit: string
  }[] = [
    {
      icon: Timer,
      name: 'TTFT',
      label: t('Time to first token, P50'),
      value: QUALITY_METRICS.ttftP50,
      unit: 'ms',
    },
    {
      icon: Gauge,
      name: 'TPS',
      label: t('Output speed per request'),
      value: QUALITY_METRICS.tps,
      unit: 'tok/s',
    },
    {
      icon: Layers,
      name: 'TPM',
      label: t('Throughput limit per org'),
      value: QUALITY_METRICS.tpm,
      unit: 'tok/min',
    },
  ]
  return (
    <dl className='border-border m-0 flex flex-col border-t'>
      {rows.map((row) => {
        const Icon = row.icon
        return (
          <div
            key={row.name}
            className='border-border grid grid-cols-[minmax(0,1fr)_124px] items-center gap-3 border-b py-3'
          >
            <dt className='flex min-w-0 items-center gap-3'>
              <span
                aria-hidden='true'
                className='bg-primary/10 flex size-[34px] flex-none items-center justify-center rounded-full'
              >
                <Icon className='text-brand-ink size-[17px]' />
              </span>
              <span className='flex min-w-0 flex-col'>
                <span className='text-foreground font-mono text-[13px]'>
                  {row.name}
                </span>
                <span className='text-muted-foreground truncate text-xs'>
                  {row.label}
                </span>
              </span>
            </dt>
            <dd className='m-0 flex items-baseline gap-1 whitespace-nowrap'>
              <span className='text-foreground font-mono text-[28px] leading-none'>
                {row.value}
              </span>
              <span className='text-muted-foreground text-xs'>{row.unit}</span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

const CARD_BODIES: Record<QualityCard['id'], () => ReactNode> = {
  supply: SupplyBody,
  cache: CacheBody,
  performance: PerformanceBody,
}

/** 运行质量：三张卡（供应稳定 → 高缓存命中率 → 高性能），数字见 QUALITY_METRICS */
export function QualityStrip() {
  const { t } = useTranslation()
  const ref = useReveal<HTMLDivElement>()
  return (
    <section
      id='quality'
      className='border-border bg-card scroll-mt-16 border-t'
    >
      <div
        ref={ref}
        className='tf-reveal mx-auto flex max-w-[1200px] flex-col gap-8 px-[clamp(20px,5vw,32px)] py-[clamp(64px,8vw,96px)]'
      >
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div className='flex flex-col gap-3'>
            <Eyebrow>{t('Service quality')}</Eyebrow>
            <h2 className='text-foreground m-0 text-[clamp(24px,2.8vw,30px)] leading-[1.25] font-medium tracking-[-0.02em]'>
              {t('How it performs in production')}
            </h2>
          </div>
          {QUALITY_METRICS.showScope && (
            <span className='text-muted-foreground font-mono text-xs'>
              {t(
                'Based on all requests in the last 7 days · viewable in console'
              )}
            </span>
          )}
        </div>
        <div className='bg-border border-border grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-px overflow-hidden rounded-xl border'>
          {QUALITY_CARDS.map((card) => {
            const Icon = CARD_ICONS[card.id]
            const Body = CARD_BODIES[card.id]
            return (
              <div
                key={card.id}
                data-quality-card={card.id}
                className='bg-background flex flex-col gap-4 p-7'
              >
                <div className='flex items-center gap-3'>
                  <span
                    aria-hidden='true'
                    className='bg-primary/10 flex size-9 flex-none items-center justify-center rounded-[10px]'
                  >
                    <Icon className='text-brand-ink size-[18px]' />
                  </span>
                  <h3 className='text-foreground m-0 text-lg leading-[26px] font-medium'>
                    {t(card.title)}
                  </h3>
                </div>
                <Body />
                <p className='text-muted-foreground m-0 text-sm leading-[22px]'>
                  {t(card.description)}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
