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
import type { ComponentProps } from 'react'

import type { CodeBlock } from '@/components/ai-elements/code-block'

import { SAMPLE_LANGS, SAMPLE_LANG_LABELS, type SampleLang } from './samples'

export type CodeBlockLanguage = NonNullable<
  ComponentProps<typeof CodeBlock>['language']
>

const LANG_HIGHLIGHT: Record<SampleLang, CodeBlockLanguage> = {
  curl: 'bash',
  python: 'python',
  typescript: 'typescript',
  javascript: 'javascript',
}

export type CodeSampleTab = {
  value: string
  label: string
  code: string
  language: CodeBlockLanguage
}

/** Build the standard curl/python/typescript/javascript tab set from a builder. */
export function buildLangTabs(
  build: (lang: SampleLang) => string
): CodeSampleTab[] {
  return SAMPLE_LANGS.map((lang) => ({
    value: lang,
    label: SAMPLE_LANG_LABELS[lang],
    code: build(lang),
    language: LANG_HIGHLIGHT[lang],
  }))
}
