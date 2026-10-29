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
import z from 'zod'

import { DOCS_DEFAULT_LANG, type DocsLang } from '../registry'

/** 正文语言由地址决定（默认中文，?lang=en 为英文），同一地址对搜索引擎内容稳定 */
export const docsSearchSchema = z.object({
  lang: z.enum(['zh', 'en']).optional().catch(undefined),
})

/** 文档链接的 search 参数：默认语言不带 ?lang，保持规范地址唯一 */
export function docsLangSearch(lang: DocsLang): { lang?: DocsLang } {
  return lang === DOCS_DEFAULT_LANG ? {} : { lang }
}
