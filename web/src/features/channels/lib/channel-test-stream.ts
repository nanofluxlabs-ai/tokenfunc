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
import { CHANNEL_TYPE_CODEX } from '../constants'

// 这些渠道类型的上游只接受流式请求（如 chatgpt.com 的 Codex 接口会返回
// "Stream must be set to true"），手动测试默认走流式，和自动测试的行为保持一致。
const STREAM_REQUIRED_CHANNEL_TYPES = new Set([CHANNEL_TYPE_CODEX])

export function channelTestRequiresStream(channelType: number): boolean {
  return STREAM_REQUIRED_CHANNEL_TYPES.has(channelType)
}
