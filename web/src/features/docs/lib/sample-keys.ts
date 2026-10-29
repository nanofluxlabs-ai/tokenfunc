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

/** 文档默认填入的密钥名 */
export const DEFAULT_SAMPLE_KEY_NAME = 'default'

type SampleKeyCandidate = { id: number; name: string; created_time: number }

/** 默认示例密钥：名为 default 的优先，否则取最近创建的一把；传入的应已是可用密钥 */
export function pickDefaultSampleKey<T extends SampleKeyCandidate>(
  keys: T[]
): T | undefined {
  const named = keys.find((key) => key.name === DEFAULT_SAMPLE_KEY_NAME)
  if (named) return named
  return keys.reduce<T | undefined>(
    (latest, key) =>
      !latest || key.created_time > latest.created_time ? key : latest,
    undefined
  )
}
