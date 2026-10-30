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
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import {
  useDocsFamilyModels,
  useDocsModelOptions,
} from '../hooks/use-docs-variables'
import { useSampleKeyHint } from '../hooks/use-sample-key-hint'
import type { ModelFamily } from '../registry'

/** 示例模型选择：label 与输入框同一行，切换后实时替换示例代码中的 {{model}} */
export function SampleModelSelect(props: {
  family: ModelFamily
  className?: string
}) {
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
    <div className={cn('flex min-w-0 items-center gap-2', props.className)}>
      <Label
        htmlFor={id}
        className='text-muted-foreground shrink-0 text-xs font-normal'
      >
        {t('Model in samples')}
      </Label>
      <Combobox
        id={id}
        options={items}
        value={models[props.family]}
        onValueChange={(value) => value && setModel(props.family, value)}
        allowCustomValue
        placeholder={t('Select or enter model name')}
        className='h-7 w-52 text-xs'
      />
    </div>
  )
}

/**
 * 指南页顶部的「示例参数」：一行内放示例模型选择与密钥提示。
 * API 页不用它，模型选择放在请求示例上方（见 doc-content 的 DocExample）。
 */
export function DocsSampleBar(props: { family?: ModelFamily }) {
  const { t } = useTranslation()
  const hint = useSampleKeyHint()
  if (!props.family && !hint) return null

  return (
    <section
      aria-label={t('Sample settings')}
      className='flex flex-wrap items-center gap-x-4 gap-y-2'
    >
      {props.family && <SampleModelSelect family={props.family} />}
      {hint && (
        <p className='text-muted-foreground text-xs leading-5'>{hint}</p>
      )}
    </section>
  )
}
