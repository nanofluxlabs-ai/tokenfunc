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
import { useEffect, useMemo } from 'react'

import { fetchTokenKey, getApiKeys } from '@/features/keys/api'
import { API_KEY_STATUS } from '@/features/keys/constants'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import { pickDefaultSampleKey } from '../lib/sample-keys'

/**
 * 文档示例与连接自检使用的密钥：自动取名为 default 的启用密钥，没有则取最近创建的一把，不提供选择。
 * 明文只在这里向服务端取一次，并只留在内存里。
 */
export function useDocsSampleKey(enabled: boolean): {
  /** 已确认用户没有可用密钥 */
  missing: boolean
  /** 正在加载密钥列表或明文 */
  loading: boolean
} {
  const key = useDocsSampleStore((state) => state.key)
  const setKey = useDocsSampleStore((state) => state.setKey)
  const requestedKeyId = useDocsSampleStore((state) => state.requestedKeyId)
  const markKeyRequested = useDocsSampleStore((state) => state.markKeyRequested)
  const keys = useQuery({
    queryKey: ['docs-sample-keys'],
    queryFn: async () =>
      requireServerSuccess(await getApiKeys({ p: 1, size: 100 })),
    enabled,
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
    if (!picked || key?.id === picked.id || requestedKeyId === picked.id) {
      return
    }
    markKeyRequested(picked.id)
    mutate({ id: picked.id, name: picked.name })
  }, [picked, key, requestedKeyId, markKeyRequested, mutate])

  return {
    missing: enabled && keys.isSuccess && !picked,
    loading: enabled && !key && !(keys.isSuccess && !picked),
  }
}
