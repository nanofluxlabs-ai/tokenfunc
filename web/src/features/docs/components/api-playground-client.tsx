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
// tokenfunc 二开：Scalar 调试面板。本模块只在用户第一次点「在线调试」时按需加载，
// Scalar（含其 Vue 运行时与样式）不进入文档页的首屏包。
import { useApiClient } from '@scalar/api-client-react'

import '@scalar/api-client-react/style.css'
import { useEffect, useMemo } from 'react'

import {
  buildPlaygroundSpec,
  PLAYGROUND_OPERATIONS,
  type PlaygroundOperation,
} from '../lib/playground-spec'
import type { ModelFamily } from '../registry'

export type ApiPlaygroundClientProps = {
  baseUrl: string
  siteName: string
  apiKey: string
  models: Record<ModelFamily, string>
  operation: PlaygroundOperation
  /** 每次点击递增，用来重复打开同一个面板 */
  openCount: number
}

export default function ApiPlaygroundClient(props: ApiPlaygroundClientProps) {
  const spec = useMemo(
    () => buildPlaygroundSpec(props.siteName, props.models),
    [props.siteName, props.models]
  )
  const client = useApiClient({
    configuration: {
      content: spec,
      servers: [{ url: props.baseUrl }],
      hideClientButton: true,
      authentication: {
        securitySchemes: {
          bearerAuth: { token: props.apiKey },
          anthropicKey: { value: props.apiKey },
          googleKey: { value: props.apiKey },
        },
      },
    },
  })

  // Scalar 的配色挂在 .light-mode / .dark-mode 上，跟随站点主题（html 上的 dark 类）切换
  useEffect(() => {
    if (!client) return
    const root = document.documentElement
    const sync = () => {
      const dark = root.classList.contains('dark')
      for (const el of document.querySelectorAll('.scalar-app')) {
        el.classList.toggle('dark-mode', dark)
        el.classList.toggle('light-mode', !dark)
      }
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [client])

  useEffect(() => {
    if (!client || props.openCount === 0) return
    const target = PLAYGROUND_OPERATIONS[props.operation]
    client.open({ path: target.path, method: target.method })
  }, [client, props.openCount, props.operation])

  return null
}
