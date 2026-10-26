import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { handleServerError } from '@/lib/handle-server-error'

import { getQuoteConfig } from '../../api'
import type { QuoteConfigEditorProps } from '../../types'
import { CapabilityEditor } from './capability-editor'
import { GroupsEditor } from './groups-editor'
import { MetaEditor } from './meta-editor'
import { ModelsEditor } from './models-editor'

type ConfigSection = 'groups' | 'models' | 'capability' | 'meta'

/** 报价单数据维护：分组 / 模型价格（含图片计费）/ 性能指标 / 导出元信息；保存即生效 */
export function ConfigTab(props: QuoteConfigEditorProps) {
  const { t } = useTranslation()
  const [section, setSection] = useState<ConfigSection>('groups')
  const [resetOpen, setResetOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const handleReset = async () => {
    setIsResetting(true)
    try {
      const response = await getQuoteConfig(true)
      if (!response.success || !response.data) {
        handleServerError(response)
        return
      }
      if (await props.onSave(response.data)) setResetOpen(false)
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Changes take effect on the next generated quote. No release needed.'
          )}
        </p>
        <Button variant='outline' size='sm' onClick={() => setResetOpen(true)}>
          <RotateCcw className='h-4 w-4' />
          {t('Reset to defaults')}
        </Button>
      </div>

      <Tabs
        value={section}
        onValueChange={(value) => setSection(value as ConfigSection)}
        className='gap-4'
      >
        <TabsList className='h-auto flex-wrap'>
          <TabsTrigger value='groups'>{t('Vendor groups')}</TabsTrigger>
          <TabsTrigger value='models'>{t('Model prices')}</TabsTrigger>
          <TabsTrigger value='capability'>
            {t('Capability metrics')}
          </TabsTrigger>
          <TabsTrigger value='meta'>{t('Export metadata')}</TabsTrigger>
        </TabsList>
        <TabsContent value='groups'>
          <GroupsEditor {...props} />
        </TabsContent>
        <TabsContent value='models'>
          <ModelsEditor {...props} />
        </TabsContent>
        <TabsContent value='capability'>
          <CapabilityEditor {...props} />
        </TabsContent>
        <TabsContent value='meta'>
          <MetaEditor {...props} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t('Reset to built-in defaults?')}
        desc={t(
          'All custom groups, models, capability metrics and metadata will be overwritten and take effect immediately.'
        )}
        destructive
        confirmText={t('Reset')}
        isLoading={isResetting || props.saving}
        handleConfirm={() => void handleReset()}
      />
    </div>
  )
}
