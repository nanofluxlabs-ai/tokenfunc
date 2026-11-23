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
import { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_SYSTEM_NAME } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface FooterLink {
  text: string
  href: string
}

interface FooterColumnProps {
  title: string
  links: FooterLink[]
}

interface FooterProps {
  logo?: string
  name?: string
  columns?: FooterColumnProps[]
  copyright?: string
  className?: string
}

function FooterLinkItem(props: { link: FooterLink }) {
  const { t } = useTranslation()
  const isExternal = props.link.href.startsWith('http')
  const label = t(props.link.text)

  if (isExternal) {
    return (
      <a
        href={props.link.href}
        target='_blank'
        rel='noopener noreferrer'
        className='text-muted-foreground hover:text-foreground text-sm transition-colors duration-200'
      >
        {label}
      </a>
    )
  }

  return (
    <Link
      to={props.link.href}
      className='text-muted-foreground hover:text-foreground text-sm transition-colors duration-200'
    >
      {label}
    </Link>
  )
}

// 用户协议 / 隐私政策（站点设置中开启时）+ 关于页常驻入口；
// 输出为 Fragment 兄弟节点，由父级 flex 的 gap 控制间距。
function LegalLinks() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const items: { key: string; label: string; href: string }[] = []
  if (status?.user_agreement_enabled) {
    items.push({
      key: 'user-agreement',
      label: t('User Agreement'),
      href: '/user-agreement',
    })
  }
  if (status?.privacy_policy_enabled) {
    items.push({
      key: 'privacy-policy',
      label: t('Privacy Policy'),
      href: '/privacy-policy',
    })
  }
  // tokenfunc 二开：关于页有默认内容，页脚常驻入口
  items.push({ key: 'about', label: t('About'), href: '/about' })
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && (
            <span aria-hidden='true' className='text-muted-foreground/30'>
              ·
            </span>
          )}
          <Link
            to={item.href}
            className='hover:text-foreground transition-colors duration-200'
          >
            {item.label}
          </Link>
        </Fragment>
      ))}
    </>
  )
}

// tokenfunc 二开：品牌标识与版权信息合并为同一区域，不再展示上游项目署名
function BrandCopyright(props: {
  logo: string
  name: string
  copyright: string
  currentYear: number
}) {
  return (
    <div className='flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start'>
      <Link to='/' className='group flex shrink-0 items-center gap-2'>
        <img
          src={props.logo}
          alt={props.name}
          className='size-6 rounded-md object-contain'
        />
        <span className='text-sm font-semibold tracking-tight'>
          {props.name}
        </span>
      </Link>
      <span className='text-muted-foreground/40 text-xs'>
        &copy; {props.currentYear} {props.name}. {props.copyright}
      </span>
    </div>
  )
}

export function Footer(props: FooterProps) {
  const { t } = useTranslation()
  const {
    systemName,
    logo: systemLogo,
    footerHtml,
    demoSiteEnabled,
  } = useSystemConfig()

  const displayLogo = systemLogo || props.logo || '/logo.png'
  const displayName = systemName || props.name || DEFAULT_SYSTEM_NAME
  const displayCopyright = props.copyright ?? t('footer.defaultCopyright')
  const isDemoSiteMode = Boolean(demoSiteEnabled)
  const currentYear = new Date().getFullYear()

  const fallbackColumns = useMemo<FooterColumnProps[]>(
    () => [
      {
        title: t('footer.columns.about.title'),
        links: [
          {
            text: t('footer.columns.about.links.aboutProject'),
            href: 'https://docs.newapi.pro/wiki/project-introduction/',
          },
          {
            text: t('footer.columns.about.links.contact'),
            href: 'https://docs.newapi.pro/support/community-interaction/',
          },
          {
            text: t('footer.columns.about.links.features'),
            href: 'https://docs.newapi.pro/wiki/features-introduction/',
          },
        ],
      },
      {
        title: t('footer.columns.docs.title'),
        links: [
          {
            text: t('footer.columns.docs.links.quickStart'),
            href: '/docs',
          },
          {
            text: t('footer.columns.docs.links.apiDocs'),
            href: '/docs/api-chat-completions',
          },
          {
            text: t('footer.columns.docs.links.toolIntegration'),
            href: '/docs/tools-claude-code',
          },
        ],
      },
      {
        title: t('footer.columns.related.title'),
        links: [
          {
            text: t('footer.columns.related.links.oneApi'),
            href: 'https://github.com/songquanpeng/one-api',
          },
          {
            text: t('footer.columns.related.links.midjourney'),
            href: 'https://github.com/novicezk/midjourney-proxy',
          },
          {
            text: t('footer.columns.related.links.newApiKeyTool'),
            href: 'https://github.com/Calcium-Ion/new-api-key-tool',
          },
        ],
      },
    ],
    [t]
  )

  const displayColumns = props.columns ?? fallbackColumns

  if (footerHtml) {
    return (
      <footer
        className={cn(
          'border-border/40 relative z-10 border-t',
          props.className
        )}
      >
        <div className='mx-auto w-full max-w-6xl px-6 py-5'>
          <div className='bg-muted/20 border-border/50 flex flex-col items-center justify-between gap-4 rounded-2xl border px-4 py-4 backdrop-blur-sm sm:flex-row sm:px-5'>
            <div
              className='custom-footer text-muted-foreground min-w-0 text-center text-sm sm:text-left'
              dangerouslySetInnerHTML={{ __html: footerHtml }}
            />
            <div className='border-border/60 text-muted-foreground/45 flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t pt-4 text-xs sm:w-auto sm:justify-end sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5'>
              <LegalLinks />
            </div>
          </div>
        </div>
      </footer>
    )
  }

  return (
    <footer
      className={cn('border-border/40 relative z-10 border-t', props.className)}
    >
      <div className='mx-auto max-w-6xl px-6 py-8'>
        {isDemoSiteMode && (
          <div className='border-border/30 mb-8 grid grid-cols-3 gap-8 border-b pb-8 md:gap-16'>
            {displayColumns.map((column) => (
              <div key={column.title}>
                <p className='text-muted-foreground/50 mb-3 text-xs font-medium tracking-wider uppercase'>
                  {t(column.title)}
                </p>
                <ul className='space-y-2.5'>
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <FooterLinkItem link={link} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* 左侧：logo + 站点名 + 版权；右侧：协议入口。窄屏上下堆叠。 */}
        <div className='flex flex-col items-center justify-between gap-x-6 gap-y-3 sm:flex-row'>
          <BrandCopyright
            logo={displayLogo}
            name={displayName}
            copyright={displayCopyright}
            currentYear={currentYear}
          />
          <div className='text-muted-foreground/40 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs sm:justify-end'>
            <LegalLinks />
          </div>
        </div>
      </div>
    </footer>
  )
}
