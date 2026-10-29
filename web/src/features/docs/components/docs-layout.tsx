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
import { ArrowRight, PanelLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import type { DocHeading } from '../lib/doc-markdown'
import { docsLangSearch } from '../lib/docs-links'
import { toolForGuide } from '../lib/self-check'
import { getDocsEntry, type DocsLang } from '../registry'
import { DocsNavList } from './docs-nav-list'
import { PrevNextLinks } from './prev-next-links'

/** 工具教程页顶部的连接自检入口，预选当前工具 */
function SelfCheckEntry(props: { slug: string; lang: DocsLang }) {
  const { t } = useTranslation()
  const tool = toolForGuide(props.slug)
  if (!tool) return null
  return (
    <Link
      to='/docs/$slug'
      params={{ slug: 'self-check' }}
      search={{ ...docsLangSearch(props.lang), tool: tool.id }}
      className='border-border/60 hover:bg-muted/30 text-muted-foreground mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors'
    >
      <span>
        {t('Configured but still not connecting? Run the connection check.')}
      </span>
      <ArrowRight className='size-3.5 shrink-0' aria-hidden='true' />
    </Link>
  )
}

function DocsToc(props: { headings: DocHeading[] }) {
  const { t } = useTranslation()
  if (props.headings.length < 2) return null
  return (
    <nav aria-label={t('On this page')} className='text-sm'>
      <div className='text-muted-foreground/70 mb-2 text-[11px] font-semibold tracking-wider uppercase'>
        {t('On this page')}
      </div>
      <ul className='space-y-1.5'>
        {props.headings.map((heading) => (
          <li key={heading.id} className={heading.level === 3 ? 'pl-3' : ''}>
            <a
              href={`#${heading.id}`}
              className='text-muted-foreground hover:text-foreground block leading-5 transition-colors'
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function DocsLayout(props: {
  slug: string
  lang: DocsLang
  headings: DocHeading[]
  /** 标题下方的「示例参数」等工具条 */
  toolbar?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const entry = getDocsEntry(props.slug)
  const [navOpen, setNavOpen] = useState(false)
  const title = entry.title[props.lang]

  return (
    <PublicLayout showMainContainer={false}>
      <div className='container px-4 pt-24 pb-16 md:px-6'>
        <div className='grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_200px]'>
          <aside className='hidden lg:block'>
            <nav
              aria-label={t('Documentation pages')}
              className='sticky top-24 max-h-[calc(100svh-8rem)] overflow-y-auto pr-2 pb-8'
            >
              <DocsNavList lang={props.lang} activeSlug={props.slug} />
            </nav>
          </aside>

          <div className='min-w-0'>
            {/* 手机目录入口吸在顶部头部下方，读长文时随时可切页 */}
            <div className='bg-background/95 sticky top-16 z-30 -mx-4 mb-5 border-b px-4 py-2 backdrop-blur md:-mx-6 md:px-6 lg:hidden'>
              <Sheet open={navOpen} onOpenChange={setNavOpen}>
                <SheetTrigger
                  render={
                    <Button
                      variant='outline'
                      size='sm'
                      aria-label={t('Docs pages')}
                      className='w-full justify-start gap-2'
                    />
                  }
                >
                  <PanelLeft className='size-4 shrink-0' />
                  <span className='truncate'>{title}</span>
                </SheetTrigger>
                <SheetContent side='left' className='overflow-y-auto pt-12'>
                  <SheetHeader>
                    <SheetTitle>{t('Docs pages')}</SheetTitle>
                  </SheetHeader>
                  <DocsNavList
                    lang={props.lang}
                    activeSlug={props.slug}
                    onNavigate={() => setNavOpen(false)}
                  />
                </SheetContent>
              </Sheet>
            </div>

            <article className='w-full max-w-3xl'>
              <h1 className='text-foreground text-3xl font-bold tracking-tight'>
                {title}
              </h1>
              <p className='text-muted-foreground mt-2 text-base'>
                {entry.description[props.lang]}
              </p>

              {props.toolbar && <div className='mt-6'>{props.toolbar}</div>}
              <SelfCheckEntry slug={props.slug} lang={props.lang} />

              <div className='mt-8'>{props.children}</div>

              <PrevNextLinks slug={props.slug} lang={props.lang} />
            </article>
          </div>

          <aside className='hidden xl:block'>
            <div className='sticky top-24 max-h-[calc(100svh-8rem)] overflow-y-auto pb-8'>
              <DocsToc headings={props.headings} />
            </div>
          </aside>
        </div>
      </div>
    </PublicLayout>
  )
}
