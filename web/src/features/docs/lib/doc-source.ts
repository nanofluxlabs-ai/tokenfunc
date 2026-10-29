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
import type { DocsLang } from '../registry'

/** 按需加载一页正文；每页是一个独立的小 chunk，打开哪页才下载哪页 */
export async function loadDocSource(
  lang: DocsLang,
  slug: string
): Promise<string> {
  const module = (await import(`../content/${lang}/${slug}.md?raw`)) as {
    default: string
  }
  return module.default
}
