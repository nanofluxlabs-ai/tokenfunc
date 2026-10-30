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
import { useRef, useState, type ReactNode } from 'react'
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
import { cn } from '@/lib/utils'

import type { DocHeading } from '../lib/doc-markdown'
import { docsLangSearch } from '../lib/docs-links'
import { toolForGuide } from '../lib/self-check'
import { getDocsEntry, type DocsLang } from '../registry'
import { DocsNavList } from './docs-nav-list'
import { DocsToc } from './docs-toc'
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

export function DocsLayout(props: {
  slug: string
  lang: DocsLang
  headings: DocHeading[]
  /** 标题下方的「示例参数」等工具条 */
  toolbar?: ReactNode
  /** API 页右侧的请求 / 响应示例栏；宽屏（xl）显示，窄屏时示例留在正文原位 */
  aside?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const entry = getDocsEntry(props.slug)
  const [navOpen, setNavOpen] = useState(false)
  // 通过手机目录切页时置位，抽屉关闭完成后回到顶部
  const scrollTopOnClose = useRef(false)
  const title = entry.title[props.lang]

  return (
    <PublicLayout showMainContainer={false}>
      <div className='container px-4 pt-24 pb-16 md:px-6'>
        <div
          className={cn(
            'grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)]',
            props.aside &&
              'xl:grid-cols-[230px_minmax(0,1fr)_22rem] 2xl:grid-cols-[230px_minmax(0,1fr)_26rem]'
          )}
        >
          <aside className='hidden lg:block'>
            <nav
              aria-label={t('Documentation pages')}
              className='sticky top-24 max-h-[calc(100svh-8rem)] overflow-y-auto pr-2 pb-8'
            >
              <DocsNavList lang={props.lang} activeSlug={props.slug} />
            </nav>
          </aside>

          <div className='min-w-0'>
            {/* 手机目录入口吸在顶部头部下方，读长文时随时可切页。
                吸顶时从视口顶端（top-0）开始铺底色，补上浮动顶栏与入口之间的缝，避免正文从缝里露出；
                -mt-16 / pt-16 抵消多出来的高度，未吸顶时位置不变 */}
            <div className='bg-background/95 sticky top-0 z-30 -mx-4 -mt-16 mb-5 border-b px-4 pt-[4.5rem] pb-2 backdrop-blur md:-mx-6 md:px-6 lg:hidden'>
              <Sheet
                open={navOpen}
                onOpenChange={setNavOpen}
                onOpenChangeComplete={(open) => {
                  // iOS 在抽屉锁定滚动期间会忽略路由的「回到顶部」，
                  // 等抽屉完全关闭、滚动解锁后再回到新页面顶部
                  if (open || !scrollTopOnClose.current) return
                  scrollTopOnClose.current = false
                  window.scrollTo({ top: 0 })
                }}
              >
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
                    onNavigate={() => {
                      scrollTopOnClose.current = true
                      setNavOpen(false)
                    }}
                  />
                </SheetContent>
              </Sheet>
            </div>

            <article className='w-full max-w-4xl'>
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

          {props.aside && (
            <aside aria-label={t('Examples')} className='hidden xl:block'>
              <div className='sticky top-24 max-h-[calc(100svh-7rem)] space-y-4 overflow-y-auto pb-8'>
                {props.aside}
              </div>
            </aside>
          )}
        </div>
        <DocsToc headings={props.headings} />
      </div>
    </PublicLayout>
  )
}
