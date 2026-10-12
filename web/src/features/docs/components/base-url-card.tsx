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
import { useTranslation } from 'react-i18next'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'

import { useDocsBaseUrl } from '../hooks/use-docs-base-url'

/**
 * Highlights the resolved gateway base URL (server address or current
 * origin) with a copy button — every endpoint path in the docs appends
 * to this base.
 */
export function BaseUrlCard() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()

  return (
    <div className='border-border/60 bg-muted/20 rounded-lg border p-4'>
      <div className='text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase'>
        {t('Base URL')}
      </div>
      <CodeBlock
        code={baseUrl}
        language='text'
        enableCollapse={false}
        className='my-0'
      >
        <CodeBlockCopyButton />
      </CodeBlock>
      <p className='text-muted-foreground mt-3 text-xs leading-relaxed'>
        {t(
          'All endpoints in these docs are relative to this base URL. If the address above is wrong, ask the site operator for the API address.'
        )}
      </p>
    </div>
  )
}
