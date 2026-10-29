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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getPricing } from '@/features/pricing/api'
import { useStatus } from '@/hooks/use-status'
import { getUserModels } from '@/lib/api'
import { DEFAULT_SYSTEM_NAME } from '@/lib/constants'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import { MODEL_FAMILIES, resolveFamilyModels } from '../lib/sample-models'
import type { ModelFamily } from '../registry'
import { useDocsBaseUrl } from './use-docs-base-url'

/** 未选择密钥时示例代码里的占位值 */
export const DOCS_API_KEY_PLACEHOLDER = 'sk-xxxxxxxxxxxxxxxx'

/**
 * 示例里可选的模型：已登录用户取自己分组下可用的模型，访客取公开的模型广场列表。
 * 两个接口失败都只影响示例模型名，不弹错误提示。
 */
export function useDocsModelOptions(): string[] {
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const userModels = useQuery({
    queryKey: ['docs-user-models'],
    queryFn: async () => requireServerSuccess(await getUserModels()),
    enabled: signedIn,
    staleTime: 5 * 60 * 1000,
    meta: { errorToast: false },
  })
  const pricing = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    enabled: !signedIn,
    staleTime: 5 * 60 * 1000,
    meta: { errorToast: false },
  })
  return useMemo(() => {
    if (signedIn) return userModels.data?.data ?? []
    return (pricing.data?.data ?? []).map((model) => model.model_name)
  }, [signedIn, userModels.data, pricing.data])
}

/** 当前页面每个系列实际使用的示例模型（用户手选优先） */
export function useDocsFamilyModels(): Record<ModelFamily, string> {
  const options = useDocsModelOptions()
  const overrides = useDocsSampleStore((state) => state.models)
  return useMemo(
    () => ({ ...resolveFamilyModels(options), ...overrides }),
    [options, overrides]
  )
}

/** 正文里 {{变量}} 的取值 */
export function useDocsVariables(family?: ModelFamily): Record<string, string> {
  const baseUrl = useDocsBaseUrl()
  const { status } = useStatus()
  const key = useDocsSampleStore((state) => state.key)
  const models = useDocsFamilyModels()
  const systemName =
    typeof status?.system_name === 'string' && status.system_name
      ? status.system_name
      : DEFAULT_SYSTEM_NAME

  return useMemo(() => {
    const vars: Record<string, string> = {
      baseUrl,
      siteName: systemName,
      apiKey: key?.value ?? DOCS_API_KEY_PLACEHOLDER,
      model: models[family ?? 'gpt'],
    }
    for (const name of MODEL_FAMILIES) vars[`model:${name}`] = models[name]
    return vars
  }, [baseUrl, systemName, key, models, family])
}
