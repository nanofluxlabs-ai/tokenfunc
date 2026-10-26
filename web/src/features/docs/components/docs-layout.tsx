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
import { PanelLeft } from 'lucide-react'
import { Suspense, useState } from 'react'
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

import { getDocsEntry } from '../registry'
import { DocsNavList } from './docs-nav-list'
import { PrevNextLinks } from './prev-next-links'

function DocsSkeleton() {
  return (
    <div className='space-y-3' aria-hidden>
      <div className='bg-muted/40 h-4 w-2/3 animate-pulse rounded' />
      <div className='bg-muted/40 h-4 w-full animate-pulse rounded' />
      <div className='bg-muted/40 h-4 w-5/6 animate-pulse rounded' />
      <div className='bg-muted/30 h-24 w-full animate-pulse rounded-lg' />
      <div className='bg-muted/40 h-4 w-1/2 animate-pulse rounded' />
      <div className='bg-muted/40 h-4 w-3/4 animate-pulse rounded' />
    </div>
  )
}

/**
 * Docs chrome: public header + sticky grouped sidebar (desktop) /
 * sheet navigation (mobile) + article with lazy page content.
 */
export function DocsLayout(props: { slug: string; children: React.ReactNode }) {
  const { t } = useTranslation()
  const entry = getDocsEntry(props.slug)
  const [navOpen, setNavOpen] = useState(false)

  return (
    <PublicLayout showMainContainer={false}>
      <div className='container px-4 pt-24 pb-16 md:px-6'>
        <div className='grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)]'>
          <aside className='hidden lg:block'>
            <nav
              aria-label={t('Documentation pages')}
              className='sticky top-24 max-h-[calc(100svh-8rem)] overflow-y-auto pr-2 pb-8'
            >
              <DocsNavList activeSlug={props.slug} />
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
                  <span className='truncate'>{t(entry.titleKey)}</span>
                </SheetTrigger>
                <SheetContent side='left' className='overflow-y-auto pt-12'>
                  <SheetHeader>
                    <SheetTitle>{t('Docs pages')}</SheetTitle>
                  </SheetHeader>
                  <DocsNavList
                    activeSlug={props.slug}
                    onNavigate={() => setNavOpen(false)}
                  />
                </SheetContent>
              </Sheet>
            </div>

            <article className='w-full max-w-3xl'>
              <h1 className='text-foreground text-3xl font-bold tracking-tight'>
                {t(entry.titleKey)}
              </h1>
              <p className='text-muted-foreground mt-2 text-base'>
                {t(entry.descriptionKey)}
              </p>

              <div className='mt-8'>
                <Suspense fallback={<DocsSkeleton />}>
                  {props.children}
                </Suspense>
              </div>

              <PrevNextLinks slug={props.slug} />
            </article>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
