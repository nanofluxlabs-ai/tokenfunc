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
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useId, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import {
  useDocsFamilyModels,
  useDocsModelOptions,
} from '../hooks/use-docs-variables'
import { pickDefaultSampleKey } from '../lib/sample-keys'
import type { ModelFamily } from '../registry'

/**
 * 示例密钥不让用户选择：自动取名为 default 的启用密钥，没有则取最近创建的一把。
 * 明文只在这里向服务端取一次，并只留在内存里。
 */
function SampleKeyStatus() {
  const { t } = useTranslation()
  const key = useDocsSampleStore((state) => state.key)
  const setKey = useDocsSampleStore((state) => state.setKey)
  const requested = useRef(false)
  const keys = useQuery({
    queryKey: ['docs-sample-keys'],
    queryFn: async () =>
      requireServerSuccess(await getApiKeys({ p: 1, size: 100 })),
    staleTime: 60 * 1000,
  })
  const picked = useMemo(
    () =>
      pickDefaultSampleKey(
        (keys.data?.data?.items ?? []).filter(
          (item) => item.status === API_KEY_STATUS.ENABLED
        )
      ),
    [keys.data]
  )
  const reveal = useMutation({
    mutationFn: async (token: { id: number; name: string }) => {
      const res = requireServerSuccess(await fetchTokenKey(token.id))
      const raw = res.data?.key ?? ''
      return { ...token, value: raw.startsWith('sk-') ? raw : `sk-${raw}` }
    },
    onSuccess: (value) => setKey(value),
  })

  const { mutate } = reveal
  useEffect(() => {
    if (requested.current || !picked || key?.id === picked.id) return
    requested.current = true
    mutate({ id: picked.id, name: picked.name })
  }, [picked, key, mutate])

  if (keys.isSuccess && !picked) {
    return (
      <p className='text-muted-foreground self-center text-xs leading-5'>
        <Link
          to='/keys'
          className='text-foreground underline underline-offset-4'
        >
          {t('Create an API key first to fill it into the samples.')}
        </Link>
      </p>
    )
  }

  return (
    <div className='min-w-0 space-y-1.5'>
      <div className='text-muted-foreground text-xs'>{t('Key in samples')}</div>
      <div className='bg-background flex h-8 items-center truncate rounded-md border px-2.5 font-mono text-xs'>
        {key?.name ?? picked?.name ?? '…'}
      </div>
    </div>
  )
}

function SampleModelSelect(props: { family: ModelFamily }) {
  const { t } = useTranslation()
  const id = useId()
  const options = useDocsModelOptions()
  const models = useDocsFamilyModels()
  const setModel = useDocsSampleStore((state) => state.setModel)
  const items = useMemo(
    () => options.map((name) => ({ value: name, label: name })),
    [options]
  )

  return (
    <div className='min-w-0 space-y-1.5'>
      <Label htmlFor={id} className='text-muted-foreground text-xs'>
        {t('Model in samples')}
      </Label>
      <Combobox
        id={id}
        options={items}
        value={models[props.family]}
        onValueChange={(value) => value && setModel(props.family, value)}
        allowCustomValue
        placeholder={t('Select or enter model name')}
        className='h-8 text-xs'
      />
    </div>
  )
}

/**
 * 文档顶部的「示例参数」：自动选定的密钥与用户可改的模型实时替换示例代码。
 */
export function DocsSampleBar(props: { family?: ModelFamily }) {
  const { t } = useTranslation()
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const key = useDocsSampleStore((state) => state.key)

  return (
    <section
      aria-label={t('Sample settings')}
      className='border-border/60 bg-muted/20 rounded-lg border p-3'
    >
      <div className='text-foreground mb-2 text-xs font-semibold'>
        {t('Sample settings')}
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        {signedIn ? (
          <SampleKeyStatus />
        ) : (
          <p className='text-muted-foreground self-center text-xs leading-5'>
            <Link
              to='/sign-in'
              className='text-foreground underline underline-offset-4'
            >
              {t('Sign in to fill the samples with your own key.')}
            </Link>
          </p>
        )}
        {props.family && <SampleModelSelect family={props.family} />}
      </div>
      {key && (
        <p className='text-muted-foreground mt-2 text-xs leading-5'>
          {t(
            'The samples now contain your real key. Do not share screenshots of this page.'
          )}
        </p>
      )}
    </section>
  )
}
