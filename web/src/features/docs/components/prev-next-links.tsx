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
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { docsLangSearch } from '../lib/docs-links'
import { getPagerNeighbors, type DocsLang } from '../registry'

/** 上一页 / 下一页，顺序跟随侧栏 */
export function PrevNextLinks(props: { slug: string; lang: DocsLang }) {
  const { t } = useTranslation()
  const { prev, next } = getPagerNeighbors(props.slug)

  if (!prev && !next) return null

  return (
    <nav
      aria-label={t('Documentation pages')}
      className='mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2'
    >
      {prev ? (
        <Link
          to='/docs/$slug'
          params={{ slug: prev.slug }}
          search={docsLangSearch(props.lang)}
          className='group border-border/60 hover:border-border hover:bg-muted/30 rounded-lg border p-3 transition-colors'
        >
          <span className='text-muted-foreground flex items-center gap-1 text-xs'>
            <ArrowLeft className='size-3.5' />
            {t('Previous')}
          </span>
          <span className='text-foreground mt-1 block text-sm font-medium'>
            {prev.title[props.lang]}
          </span>
        </Link>
      ) : (
        <span aria-hidden className='hidden sm:block' />
      )}
      {next ? (
        <Link
          to='/docs/$slug'
          params={{ slug: next.slug }}
          search={docsLangSearch(props.lang)}
          className='group border-border/60 hover:border-border hover:bg-muted/30 rounded-lg border p-3 text-right transition-colors'
        >
          <span className='text-muted-foreground flex items-center justify-end gap-1 text-xs'>
            {t('Next')}
            <ArrowRight className='size-3.5' />
          </span>
          <span className='text-foreground mt-1 block text-sm font-medium'>
            {next.title[props.lang]}
          </span>
        </Link>
      ) : (
        <span aria-hidden className='hidden sm:block' />
      )}
    </nav>
  )
}
