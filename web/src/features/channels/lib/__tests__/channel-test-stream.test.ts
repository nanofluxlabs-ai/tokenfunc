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

import { CHANNEL_TYPE_CODEX, CHANNEL_TYPE_OLLAMA } from '../../constants'
import { channelTestRequiresStream } from '../channel-test-stream'

describe('channelTestRequiresStream', () => {
  it('returns true for a Codex channel because its upstream rejects non-stream requests', () => {
    expect(channelTestRequiresStream(CHANNEL_TYPE_CODEX)).toBe(true)
  })

  it.each([
    { name: 'OpenAI', type: 1 },
    { name: 'Ollama', type: CHANNEL_TYPE_OLLAMA },
    { name: 'unknown', type: 0 },
  ])('returns false for a $name channel', ({ type }) => {
    expect(channelTestRequiresStream(type)).toBe(false)
  })
})
