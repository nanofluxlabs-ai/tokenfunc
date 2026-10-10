/*
tokenfunc 二开：关于页默认内容。
后台「关于」option 为空时渲染这一页；管理员填了内容则由 features/about/index.tsx 渲染配置内容。
文案与首页营销页共用同一组 i18n 键（landing/content.ts），避免两套口径。
*/
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BadgeCheck,
  Database,
  Gauge,
  Layers,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Eyebrow,
  Panel,
} from '@/features/landing/components/landing-primitives'
import { CAPABILITIES, type Capability } from '@/features/landing/content'
import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_LOGO, DEFAULT_SYSTEM_NAME } from '@/lib/constants'

const CAPABILITY_ICONS: Record<Capability['id'], LucideIcon> = {
  security: ShieldCheck,
  fidelity: BadgeCheck,
  supply: Layers,
  performance: Gauge,
  cache: Database,
}

export function BrandAbout() {
  const { t } = useTranslation()
  const { systemName, logo } = useSystemConfig()
  const displayName = systemName || DEFAULT_SYSTEM_NAME
  const displayLogo = logo || DEFAULT_LOGO

  return (
    <div className='mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-10 md:px-8 md:py-14'>
      <Panel className='relative'>
        <div
          className='tf-glow-horizon pointer-events-none absolute inset-0'
          aria-hidden='true'
        />
        <div className='relative grid items-center gap-10 p-8 md:grid-cols-[minmax(0,1fr)_320px] md:p-12'>
          <div className='flex flex-col gap-6'>
            <div className='flex items-center gap-3'>
              <img
                src={displayLogo}
                alt=''
                className='size-10 rounded-lg object-contain'
              />
              <div className='flex flex-col'>
                {/* 品牌固定英文标记，不进 i18n */}
                <Eyebrow>TOKENFUNC</Eyebrow>
                <span className='text-foreground text-sm'>{displayName}</span>
              </div>
            </div>
            <h1 className='text-foreground m-0 text-[clamp(32px,5vw,56px)] leading-[1.1] font-bold tracking-[-0.03em]'>
              {t('Enterprise-grade LLM API platform')}
            </h1>
            <p className='text-muted-foreground m-0 max-w-[640px] text-base leading-7 text-pretty md:text-lg md:leading-8'>
              {t(
                'Built for enterprises: official direct access to Anthropic, OpenAI, Google and xAI. Smart routing with automatic failover, 99.95% availability, dedicated deployment on request, secure and stable.'
              )}
            </p>
            <div className='flex flex-wrap gap-3'>
              <Button
                size='lg'
                className='font-semibold'
                render={<a href='/#contact' />}
              >
                {t('Request an enterprise trial')}
                <ArrowRight aria-hidden='true' />
              </Button>
              <Button
                size='lg'
                variant='secondary'
                className='border-border border font-semibold'
                render={<Link to='/sign-up' />}
              >
                {t('Sign up free')}
                <ArrowRight aria-hidden='true' />
              </Button>
            </div>
          </div>
          <div className='border-border bg-foreground/[0.03] hidden aspect-square flex-col items-center justify-center gap-6 rounded-2xl border md:flex'>
            <img src={displayLogo} alt='' className='size-28 object-contain' />
            {/* 品牌固定英文标记，不进 i18n */}
            <Eyebrow className='text-center'>
              TOKENFUNC · ENTERPRISE GATEWAY
            </Eyebrow>
          </div>
        </div>
      </Panel>

      <div className='grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-6'>
        {CAPABILITIES.map((capability) => {
          const Icon = CAPABILITY_ICONS[capability.id]
          return (
            <Panel key={capability.id} className='flex flex-col gap-5 p-6'>
              <span className='bg-primary/10 text-primary flex size-12 items-center justify-center rounded-lg'>
                <Icon className='size-5' aria-hidden='true' />
              </span>
              <div className='flex flex-col gap-2'>
                <h2 className='text-foreground m-0 text-lg font-semibold'>
                  {t(capability.title)}
                </h2>
                <p className='text-muted-foreground m-0 text-sm leading-6 text-pretty'>
                  {t(capability.description)}
                </p>
              </div>
            </Panel>
          )
        })}
      </div>

      <Panel className='text-muted-foreground flex flex-col gap-3 px-6 py-5 text-sm md:flex-row md:items-center md:justify-between'>
        <span>
          {t(
            'The Platform is not offered to the general public in mainland China.'
          )}
        </span>
        <span className='flex items-center gap-3'>
          <Link
            to='/user-agreement'
            className='hover:text-foreground transition-colors'
          >
            {t('User Agreement')}
          </Link>
          <span aria-hidden='true' className='text-muted-foreground/30'>
            ·
          </span>
          <Link
            to='/privacy-policy'
            className='hover:text-foreground transition-colors'
          >
            {t('Privacy Policy')}
          </Link>
        </span>
      </Panel>
    </div>
  )
}
