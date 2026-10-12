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
/** Sidebar groups in display order. */
export type DocsGroupId =
  | 'quick-start'
  | 'model-access-api'
  | 'tool-integration'

export type DocsPageEntry = {
  /** URL slug rendered at /docs/$slug */
  slug: string
  group: DocsGroupId
  /** i18n key (English literal) for the page title */
  titleKey: string
  /** i18n key (English literal) for the description under the title */
  descriptionKey: string
}

export type DocsNavGroup = {
  id: DocsGroupId
  titleKey: string
  pages: DocsPageEntry[]
}
