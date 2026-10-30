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
// tokenfunc 二开：把 Scalar 的调试面板（Vue 组件 Operation）直接挂进文档正文。
// Scalar 的 React 包只提供弹窗，这里参照其弹窗实现（create-api-client-modal）自行挂载。
// 本模块只在用户第一次展开「在线调试」时按需加载，Scalar 与 Vue 不进入首屏包。
import '@scalar/api-client/style.css'
import { Operation } from '@scalar/api-client/features/operation'
import { initializeWorkspaceEventHandlers } from '@scalar/api-client/v2/workspace-events'
import { addScalarClassesToHeadless } from '@scalar/components/helpers'
import { ScalarTeleportRoot } from '@scalar/components/teleport'
import { ScalarToasts } from '@scalar/use-toasts'
import {
  createWorkspaceStore,
  type WorkspaceStore,
} from '@scalar/workspace-store/client'
import {
  createWorkspaceEventBus,
  type WorkspaceEventBus,
} from '@scalar/workspace-store/events'
import { getActiveEnvironment } from '@scalar/workspace-store/request-example'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { computed, createApp, h, reactive, ref } from 'vue'

import { toIntlLocale } from '@/i18n/languages'

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
}

type ScalarOptions = Record<string, unknown>

type PlaygroundWorkspace = {
  store: WorkspaceStore
  eventBus: WorkspaceEventBus
  /** 当前生效的配置，供事件处理读取默认鉴权 */
  options: { value: ScalarOptions }
}

let workspace: PlaygroundWorkspace | undefined
/** 已注册的文档（按规范内容去重），值为文档名与注册完成的 Promise */
const documents = new Map<string, { name: string; ready: Promise<boolean> }>()

/** 页面内所有调试块共用一个工作区，与 Scalar 弹窗的单例做法一致 */
function getPlaygroundWorkspace(): PlaygroundWorkspace {
  if (workspace) return workspace
  const store = createWorkspaceStore()
  const eventBus = createWorkspaceEventBus({ debug: false })
  const options = ref<ScalarOptions>({})
  initializeWorkspaceEventHandlers({
    eventBus,
    store: ref(store),
    hooks: {},
    getConfiguredSecuritySchemes: () =>
      (options.value.authentication as { securitySchemes?: never } | undefined)
        ?.securitySchemes,
  })
  workspace = { store, eventBus, options }
  return workspace
}

export default function ApiPlaygroundClient(props: ApiPlaygroundClientProps) {
  const { i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language) ?? 'en'
  const spec = useMemo(
    () => buildPlaygroundSpec(props.siteName, props.models),
    [props.siteName, props.models]
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const playground = getPlaygroundWorkspace()
    const slug = JSON.stringify(spec)
    let registered = documents.get(slug)
    if (!registered) {
      const docName = `docs-${documents.size}`
      registered = {
        name: docName,
        ready: playground.store.addDocument({ name: docName, document: spec }),
      }
      documents.set(slug, registered)
    }
    const name = registered.name
    const target = PLAYGROUND_OPERATIONS[props.operation]
    const options: ScalarOptions = {
      servers: [{ url: props.baseUrl }],
      hideClientButton: true,
      localization: { locale },
      authentication: {
        securitySchemes: {
          bearerAuth: { token: props.apiKey },
          anthropicKey: { value: props.apiKey },
          googleKey: { value: props.apiKey },
        },
      },
    }
    playground.options.value = options

    let unmount: (() => void) | undefined
    let cancelled = false
    void registered.ready.then(() => {
      if (cancelled) return
      const document = computed(
        () => playground.store.workspace.documents[name] ?? null
      )
      const environment = computed(
        () => getActiveEnvironment(playground.store, document.value).environment
      )
      const app = createApp({
        setup() {
          addScalarClassesToHeadless()
          return () =>
            h(ScalarTeleportRoot, null, () => [
              h(ScalarToasts),
              h(Operation, {
                class: 'h-full',
                document: document.value as never,
                documentSlug: name,
                environment: environment.value,
                eventBus: playground.eventBus,
                exampleName: 'default',
                isActive: true,
                layout: 'modal',
                method: target.method,
                options: reactive(options) as never,
                path: target.path,
                plugins: [],
                requestBodyCompositionSelection: {},
                workspaceStore: playground.store,
              }),
            ])
        },
      })
      app.mount(el)
      unmount = () => app.unmount()
    })
    return () => {
      cancelled = true
      unmount?.()
    }
  }, [spec, props.operation, props.baseUrl, props.apiKey, locale])

  // Scalar 的配色挂在 .light-mode / .dark-mode 上，跟随站点主题（html 上的 dark 类）切换
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const root = document.documentElement
    const sync = () => {
      const dark = root.classList.contains('dark')
      el.classList.toggle('dark-mode', dark)
      el.classList.toggle('light-mode', !dark)
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className='scalar scalar-app docs-playground-panel h-full'
    />
  )
}
