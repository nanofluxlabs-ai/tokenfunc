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
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { CodeBlock, CodeBlockEditor } from '../code-block'

afterEach(() => {
  cleanup()
})

describe('CodeBlock', () => {
  test('reserves vertical space for the actual line count, not a 4-line minimum', () => {
    const { getByRole } = render(
      <CodeBlock
        code='export KEY=value'
        enableCollapse={false}
        language='bash'
      />
    )

    // 1 line * 1.5rem + 1.75rem vertical padding. The old 4-row floor
    // reserved 8rem, leaving 4-5 lines of empty space under one-liners.
    const editor = getByRole('textbox', { name: 'bash' })
    expect(editor.style.getPropertyValue('--code-editor-min-height')).toBe(
      '3.25rem'
    )
  })

  test('aligns the first code line with the copy overlay and pads the left edge', () => {
    render(
      <CodeBlock
        code='export KEY=value'
        enableCollapse={false}
        language='bash'
      />
    )

    // CodeMirror mounts its theme through adopted stylesheets, so assert on
    // the live .cm-content node instead of scanning document.styleSheets.
    const content = document.querySelector('.cm-content')
    expect(content).not.toBeNull()
    // 0.75rem top puts the first line's center (0.75 + 0.75rem) level with
    // the copy button (top-2 + size-8/2 = 1.5rem); 1rem left keeps code off
    // the border when the line-number gutter is hidden.
    const styles = getComputedStyle(content!)
    expect(styles.paddingTop).toBe('0.75rem')
    expect(styles.paddingLeft).toBe('1rem')
  })
})

describe('CodeBlockEditor', () => {
  test('still reserves its configured rows', () => {
    const { getByRole } = render(
      <CodeBlockEditor
        ariaLabel='Edit message'
        language='markdown'
        onChange={() => undefined}
        rows={6}
        value='hello'
      />
    )

    const editor = getByRole('textbox', { name: 'Edit message' })
    expect(editor.style.getPropertyValue('--code-editor-min-height')).toBe(
      '10.75rem'
    )
  })
})
