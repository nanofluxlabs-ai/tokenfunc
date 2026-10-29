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

import type { ModelFamily } from '@/features/docs/registry'

export type DocsSampleKey = { id: number; name: string; value: string }

interface DocsSampleState {
  /** 用户在文档里选中的密钥；明文只放内存，刷新即丢，绝不落盘 */
  key: DocsSampleKey | null
  /** 用户在文档里手动改过的示例模型，按系列记忆，翻页后保留 */
  models: Partial<Record<ModelFamily, string>>
  setKey: (key: DocsSampleKey | null) => void
  setModel: (family: ModelFamily, model: string) => void
}

export const useDocsSampleStore = create<DocsSampleState>()((set) => ({
  key: null,
  models: {},
  setKey: (key) => set({ key }),
  setModel: (family, model) =>
    set((state) => ({ models: { ...state.models, [family]: model } })),
}))
