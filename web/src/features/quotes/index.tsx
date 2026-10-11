import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { handleServerError } from '@/lib/handle-server-error'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import { getQuoteConfig, updateQuoteConfig } from './api'
import { ConfigTab } from './components/config/config-tab'
import { GenerateTab } from './components/generate-tab'
import { QUOTE_CONFIG_QUERY_KEY } from './constants'
import type { QuoteConfig } from './types'

/**
 * 报价单：按各供应商分组折扣、汇率与有效期渲染对外价目表；
 * 模型清单、官方价、性能指标等数据在「报价单配置」标签页维护，保存即生效。
 */
export function Quotes() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'generate' | 'config'>('generate')

  const configQuery = useQuery({
    queryKey: QUOTE_CONFIG_QUERY_KEY,
    queryFn: async () => {
      const response = requireServerSuccess(await getQuoteConfig())
      if (!response.data) throw createServerError(response)
      return response.data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (next: QuoteConfig) =>
      requireServerSuccess(await updateQuoteConfig(next)),
    onSuccess: (_result, next) => {
      queryClient.setQueryData(QUOTE_CONFIG_QUERY_KEY, next)
      toast.success(t('Quote configuration saved'))
    },
    onError: (error) => handleServerError(error),
  })

  const saveConfig = async (next: QuoteConfig) => {
    try {
      await saveMutation.mutateAsync(next)
      return true
    } catch {
      return false
    }
  }

  const renderBody = () => {
    if (configQuery.isPending) return <LoadingState />
    if (configQuery.isError || !configQuery.data) {
      return <ErrorState onRetry={() => void configQuery.refetch()} />
    }
    const config = configQuery.data
    return (
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as 'generate' | 'config')}
        className='gap-4'
      >
        <TabsList variant='line'>
          <TabsTrigger value='generate'>{t('Generate quote')}</TabsTrigger>
          <TabsTrigger value='config'>{t('Quote configuration')}</TabsTrigger>
        </TabsList>
        <TabsContent value='generate'>
          <GenerateTab config={config} />
        </TabsContent>
        <TabsContent value='config'>
          <ConfigTab
            config={config}
            onSave={saveConfig}
            saving={saveMutation.isPending}
          />
        </TabsContent>
      </Tabs>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Quotations')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>{renderBody()}</SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
