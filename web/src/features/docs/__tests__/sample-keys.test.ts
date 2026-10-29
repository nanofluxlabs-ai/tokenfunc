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
import { describe, expect, it } from 'vitest'

import { pickDefaultSampleKey } from '../lib/sample-keys'

const key = (id: number, name: string, created_time: number) => ({
  id,
  name,
  created_time,
})

describe('pickDefaultSampleKey', () => {
  it('prefers the key named default even when newer keys exist', () => {
    expect(
      pickDefaultSampleKey([
        key(1, 'cursor', 300),
        key(2, 'default', 100),
        key(3, 'codex', 200),
      ])?.id
    ).toBe(2)
  })

  it('falls back to the most recently created key', () => {
    expect(
      pickDefaultSampleKey([
        key(1, 'cursor', 100),
        key(2, 'codex', 300),
        key(3, 'cline', 200),
      ])?.id
    ).toBe(2)
  })

  it('returns nothing when the user has no usable key', () => {
    expect(pickDefaultSampleKey([])).toBeUndefined()
  })
})
