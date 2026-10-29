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
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { DocsGroupId } from '@/features/docs/registry'

interface DocsNavState {
  /** 被读者折叠的侧栏分组；默认全部展开，只记在本浏览器 */
  collapsed: DocsGroupId[]
  setGroupOpen: (group: DocsGroupId, open: boolean) => void
}

export const useDocsNavStore = create<DocsNavState>()(
  persist(
    (set) => ({
      collapsed: [],
      setGroupOpen: (group, open) =>
        set((state) => {
          const rest = state.collapsed.filter((id) => id !== group)
          return { collapsed: open ? rest : [...rest, group] }
        }),
    }),
    { name: 'tokenfunc:docs-nav:v1' }
  )
)
