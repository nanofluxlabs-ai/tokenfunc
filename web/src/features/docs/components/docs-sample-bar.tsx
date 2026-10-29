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
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth-store'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import { useDocsSampleKey } from '../hooks/use-docs-sample-key'
import {
  useDocsFamilyModels,
  useDocsModelOptions,
} from '../hooks/use-docs-variables'
import type { ModelFamily } from '../registry'

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
 * 文档顶部的「示例参数」：密钥自动填入不可选，模型可改，二者实时替换示例代码。
 */
export function DocsSampleBar(props: { family?: ModelFamily }) {
  const { t } = useTranslation()
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const key = useDocsSampleStore((state) => state.key)
  const { missing } = useDocsSampleKey(signedIn)

  let hint = null
  if (!signedIn) {
    hint = (
      <Link
        to='/sign-in'
        className='text-foreground underline underline-offset-4'
      >
        {t('Sign in to fill the samples with your own key.')}
      </Link>
    )
  } else if (missing) {
    hint = (
      <Link to='/keys' className='text-foreground underline underline-offset-4'>
        {t('Create an API key first to fill it into the samples.')}
      </Link>
    )
  } else if (key) {
    hint = t(
      'The samples now contain your real key. Do not share screenshots of this page.'
    )
  }

  if (!props.family && !hint) return null

  return (
    <section
      aria-label={t('Sample settings')}
      className='border-border/60 bg-muted/20 space-y-2 rounded-lg border p-3'
    >
      {props.family && (
        <div className='sm:max-w-xs'>
          <SampleModelSelect family={props.family} />
        </div>
      )}
      {hint && (
        <p className='text-muted-foreground text-xs leading-5'>{hint}</p>
      )}
    </section>
  )
}
