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

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import { useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { useDocsSampleKey } from '../hooks/use-docs-sample-key'
import {
  useDocsFamilyModels,
  useDocsVariables,
} from '../hooks/use-docs-variables'
import type { PlaygroundOperation } from '../lib/playground-spec'

const ApiPlaygroundClient = lazy(() => import('./api-playground-client'))

/**
 * API 页上的「在线调试」：点击后才加载 Scalar 调试面板，并预选当前接口、填好默认密钥与本站地址。
 * 调试发出的是真实请求，按实际用量扣费。
 */
export function ApiPlaygroundButton(props: { operation: PlaygroundOperation }) {
  const { t } = useTranslation()
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const key = useDocsSampleStore((state) => state.key)
  const keyState = useDocsSampleKey(signedIn)
  const baseUrl = useDocsBaseUrl()
  const models = useDocsFamilyModels()
  const vars = useDocsVariables()
  const [openCount, setOpenCount] = useState(0)

  let hint = t(
    'Requests sent from the playground are real and billed by actual usage.'
  )
  if (!signedIn) hint = t('Sign in to try this endpoint online.')
  else if (keyState.missing) {
    hint = t('Create an API key first to fill it into the samples.')
  }

  const loading = openCount > 0
  return (
    <div className='docs-block border-border/60 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'>
      <p className='text-muted-foreground text-xs leading-5'>
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
      <Button
        size='sm'
        className='shrink-0'
        disabled={!key}
        onClick={() => setOpenCount((count) => count + 1)}
      >
        <Play className='size-4' aria-hidden='true' />
        {t('Try it online')}
      </Button>
      {key && loading && (
        <Suspense
          fallback={
            <Loader2
              className='text-muted-foreground size-4 animate-spin'
              aria-label={t('Loading')}
            />
          }
        >
          <ApiPlaygroundClient
            baseUrl={baseUrl}
            siteName={vars.siteName}
            apiKey={key.value}
            models={models}
            operation={props.operation}
            openCount={openCount}
          />
        </Suspense>
      )}
    </div>
  )
}
