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
import { useState } from 'react'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { CodeSampleTab } from '../lib/code-sample-tabs'

/** Tabbed, copyable code sample used across all docs content pages. */
export function CodeSample(props: { tabs: CodeSampleTab[] }) {
  const [active, setActive] = useState(props.tabs[0]?.value ?? '')
  const current =
    props.tabs.find((tab) => tab.value === active) ?? props.tabs[0]
  if (!current) return null

  const isSingle = props.tabs.length === 1

  return (
    <div>
      {!isSingle && (
        <Tabs value={current.value} onValueChange={setActive}>
          <TabsList className='bg-muted/40 h-8 p-0.5'>
            {props.tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className='h-9 px-3 text-xs sm:h-7 sm:px-2.5'
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <CodeBlock
        code={current.code}
        language={current.language}
        enableCollapse={false}
        className='my-0'
      >
        <CodeBlockCopyButton />
      </CodeBlock>
    </div>
  )
}
