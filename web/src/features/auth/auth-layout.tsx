/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

/**
 * 左栏品牌区的两种文案：登录页展示指标，注册页展示三条卖点。
 * 其他认证页（找回密码、OTP、OAuth 回调）复用登录页文案。
 */
export type AuthLayoutVariant = 'sign-in' | 'sign-up'

type AuthLayoutProps = {
  children: React.ReactNode
  variant?: AuthLayoutVariant
}

const SIGN_IN_STATS: { value: string; label: string }[] = [
  { value: '99.95%', label: 'Service SLA' },
  { value: '500+', label: 'Official pool' },
  { value: '90%+', label: 'Cache hit rate' },
]

const SIGN_UP_POINTS = [
  'Official direct access, real models with no substitution',
  '500+ account pool, stable supply',
  'Bodies never touch disk, secure and compliant',
]

function riseDelay(index: number): CSSProperties {
  return { '--tf-rise-delay': `${120 + index * 90}ms` } as CSSProperties
}

function BrandAside(props: { variant: AuthLayoutVariant }) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()
  const isSignUp = props.variant === 'sign-up'

  return (
    <aside className='bg-sidebar border-border relative flex flex-col justify-between gap-16 overflow-hidden border-b px-8 py-10 lg:border-r lg:border-b-0 lg:px-16'>
      <div className='tf-aurora' aria-hidden='true' />
      <Link
        to='/'
        className='tf-rise text-foreground relative inline-flex w-fit items-center gap-2.5 text-xl font-bold tracking-[-0.04em]'
        style={riseDelay(0)}
      >
        {loading ? (
          <Skeleton className='size-7 rounded-full' />
        ) : (
          <img
            src={logo}
            alt={t('Logo')}
            className='tf-spin size-7 rounded-md object-cover'
          />
        )}
        {loading ? <Skeleton className='h-5 w-24' /> : systemName}
      </Link>

      <div className='relative flex max-w-[460px] flex-col gap-8'>
        <h1 className='text-foreground m-0 flex flex-col text-[clamp(40px,4.6vw,64px)] leading-[1.15] font-light tracking-[-0.03em]'>
          <span className='tf-rise' style={riseDelay(1)}>
            {isSignUp ? t('Enterprise-grade') : t('One endpoint')}
          </span>
          <span
            className='tf-rise text-brand-ink font-bold'
            style={riseDelay(2)}
          >
            {isSignUp ? t('model gateway') : t('every major model')}
          </span>
        </h1>
        <p
          className='tf-rise text-muted-foreground m-0 max-w-[400px] leading-7 text-pretty'
          style={riseDelay(3)}
        >
          {isSignUp
            ? t(
                'Sign up to create an API key, then change one base_url to connect.'
              )
            : t(
                'Official direct access to Claude / GPT / Gemini / Grok, billed per token, with stable supply for enterprises.'
              )}
        </p>
        <div
          className='tf-rise bg-border relative h-px overflow-hidden'
          style={riseDelay(4)}
        >
          <span
            aria-hidden='true'
            className='tf-sweep absolute top-0 left-0 h-full w-1/4 bg-[linear-gradient(90deg,transparent,var(--primary),transparent)]'
          />
        </div>
        {isSignUp ? (
          <ul className='m-0 flex list-none flex-col gap-4 p-0'>
            {SIGN_UP_POINTS.map((point, index) => (
              <li
                key={point}
                className='tf-rise text-foreground/90 flex items-center gap-3.5'
                style={riseDelay(5 + index)}
              >
                <span
                  className='bg-primary size-1.5 shrink-0 rounded-full'
                  aria-hidden='true'
                />
                {t(point)}
              </li>
            ))}
          </ul>
        ) : (
          <dl
            className='tf-rise m-0 grid grid-cols-3 gap-6'
            style={riseDelay(5)}
          >
            {SIGN_IN_STATS.map((stat) => (
              <div key={stat.label} className='flex flex-col gap-2'>
                <dd className='text-foreground m-0 text-[clamp(26px,2.4vw,34px)] leading-none font-bold tracking-[-0.03em] tabular-nums'>
                  {stat.value}
                </dd>
                <dt className='text-muted-foreground text-[13px]'>
                  {t(stat.label)}
                </dt>
              </div>
            ))}
          </dl>
        )}
      </div>

      <span className='text-muted-foreground/70 relative text-[13px]'>
        © {new Date().getFullYear()} {systemName}
      </span>
    </aside>
  )
}

/** 认证页布局：左栏品牌区 + 右栏表单（窄屏时上下堆叠） */
export function AuthLayout({ children, variant = 'sign-in' }: AuthLayoutProps) {
  return (
    <div className='bg-background text-foreground grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
      <BrandAside variant={variant} />
      <main className='flex items-center justify-center px-6 py-12 md:px-8 md:py-16'>
        <div
          className='tf-rise flex w-full max-w-[400px] flex-col gap-8'
          style={riseDelay(2)}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
