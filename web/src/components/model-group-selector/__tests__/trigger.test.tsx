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
import { render, screen } from '@testing-library/react'
import { beforeAll, expect, test, vi } from 'vitest'

import { ModelGroupSelector } from '@/components/model-group-selector'

const LONG_GROUP_LABEL = '【订阅】Claude · GPT · 国产 混合号池'

beforeAll(() => {
  // useIsMobile 依赖 matchMedia；jsdom 没有，按桌面宽度桩掉
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
})

test('a long group label in the trigger is clamped and truncated with the full name on hover so it cannot spill over the send button', () => {
  render(
    <ModelGroupSelector
      selectedModel='gpt-5.6-luna'
      models={[{ value: 'gpt-5.6-luna', label: 'gpt-5.6-luna' }]}
      onModelChange={vi.fn()}
      selectedGroup='default'
      groups={[{ value: 'default', label: LONG_GROUP_LABEL, ratio: 1 }]}
      onGroupChange={vi.fn()}
    />
  )

  const trigger = screen.getByRole('combobox')
  const badge = screen.getByTitle(LONG_GROUP_LABEL)
  expect(trigger).toContainElement(badge)
  expect(badge).toHaveTextContent(LONG_GROUP_LABEL)
  // 限宽 + 截断：text-overflow 只对块级 / inline-block 生效，不能是 inline-flex
  expect(badge).toHaveClass('max-w-24', 'truncate', 'sm:inline-block')
  expect(badge).not.toHaveClass('sm:inline-flex')
  // 整个触发器仍限宽，模型名保留优先级
  expect(trigger).toHaveClass('max-w-[15rem]')
  expect(screen.getByText('gpt-5.6-luna')).toHaveClass('truncate')
})
