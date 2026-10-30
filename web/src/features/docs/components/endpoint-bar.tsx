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
import { Link } from '@tanstack/react-router'
import { Loader2, Play } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import { useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { useDocsSampleKey } from '../hooks/use-docs-sample-key'
import {
  useDocsFamilyModels,
  useDocsVariables,
} from '../hooks/use-docs-variables'
import {
  isPlaygroundOperation,
  type PlaygroundOperation,
} from '../lib/playground-spec'
import { MethodBadge } from './method-badge'

const ApiPlaygroundClient = lazy(() => import('./api-playground-client'))

/** 路径按 / 分段，斜杠淡化、{参数} 高亮，读起来更像 Mintlify 的地址栏 */
function EndpointPath(props: { path: string }) {
  // 以截至该段的路径前缀作 key，同名分段（如 /v1/v1）也不会冲突
  let prefix = ''
  const segments = props.path
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      prefix = `${prefix}/${segment}`
      return { segment, key: prefix }
    })
  return (
    <>
      {segments.map(({ segment, key }) => (
        <span key={key}>
          <span className='text-muted-foreground/60'>/</span>
          <span
            className={cn(
              'text-foreground',
              segment.includes('{') && 'text-primary'
            )}
          >
            {segment}
          </span>
        </span>
      ))}
    </>
  )
}

/**
 * API 页顶部的接口地址栏：请求方法、完整地址、复制，以及「在线调试」。
 * 在线调试点击后才加载 Scalar 弹窗，预选当前接口、填好默认密钥与本站地址；
 * 调试发出的是真实请求，按实际用量扣费。
 */
export function EndpointBar(props: {
  method: string
  path: string
  operation?: string
}) {
  const { t } = useTranslation()
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const key = useDocsSampleStore((state) => state.key)
  const keyState = useDocsSampleKey(signedIn)
  const baseUrl = useDocsBaseUrl()
  const models = useDocsFamilyModels()
  const vars = useDocsVariables()
  const [openCount, setOpenCount] = useState(0)
  const method = props.method.toUpperCase()
  const operation: PlaygroundOperation | undefined = isPlaygroundOperation(
    props.operation
  )
    ? props.operation
    : undefined

  let hint = t(
    'Requests sent from the playground are real and billed by actual usage.'
  )
  if (!signedIn) hint = t('Sign in to try this endpoint online.')
  else if (keyState.missing) {
    hint = t('Create an API key first to fill it into the samples.')
  }

  return (
    <div className='docs-block'>
      <div className='bg-muted/20 flex items-center gap-2 rounded-xl border p-1.5 pl-2'>
        <MethodBadge method={method} />
        <code className='min-w-0 flex-1 truncate font-mono text-sm'>
          <span className='text-muted-foreground'>{baseUrl}</span>
          <EndpointPath path={props.path} />
        </code>
        <CopyButton
          value={`${baseUrl}${props.path}`}
          size='icon-sm'
          className='shrink-0'
        />
        {operation && (
          <Button
            size='sm'
            className='shrink-0'
            disabled={!key}
            onClick={() => setOpenCount((count) => count + 1)}
          >
            {t('Try it online')}
            <Play className='size-3.5 fill-current' aria-hidden='true' />
          </Button>
        )}
      </div>
      {operation && (
        <p className='text-muted-foreground mt-1.5 px-1 text-xs'>
          {!signedIn || keyState.missing ? (
            <Link
              to={signedIn ? '/keys' : '/sign-in'}
              className='text-foreground underline underline-offset-4'
            >
              {hint}
            </Link>
          ) : (
            hint
          )}
        </p>
      )}
      {operation && key && openCount > 0 && (
        <Suspense
          fallback={
            <Loader2
              className='text-muted-foreground mt-2 size-4 animate-spin'
              aria-label={t('Loading')}
            />
          }
        >
          <ApiPlaygroundClient
            baseUrl={baseUrl}
            siteName={vars.siteName}
            apiKey={key.value}
            models={models}
            operation={operation}
            openCount={openCount}
          />
        </Suspense>
      )}
    </div>
  )
}
