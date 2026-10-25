import { Download } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'

import { downloadUsageExport } from '../../api'
import {
  usageScopeOf,
  usageScopeReady,
} from '../../hooks/use-usage-breakdown-queries'
import { readBlobError, saveBlob } from '../../lib/csv'
import type { UsageRangeParams } from '../../types'

type ExportCsvControlProps = UsageRangeParams & {
  filename: string
  disabled?: boolean
}

/** 「导出消费明细」复选框 + 导出 CSV 按钮；明细默认不导出 */
export function ExportCsvControl(props: ExportCsvControlProps) {
  const { t } = useTranslation()
  const checkboxId = useId()
  const [includeDetail, setIncludeDetail] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await downloadUsageExport({
        ...usageScopeOf(props),
        ts_start: props.ts_start,
        ts_end: props.ts_end,
        include_detail: includeDetail,
      })
      const message = await readBlobError(blob)
      if (message) {
        toast.error(message)
        return
      }
      saveBlob(blob, props.filename)
    } catch (error) {
      handleServerError(error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className='flex items-center gap-3'>
      <div className='flex items-center gap-1.5'>
        <Checkbox
          id={checkboxId}
          checked={includeDetail}
          onCheckedChange={(checked) => setIncludeDetail(checked === true)}
          disabled={props.disabled || exporting}
        />
        <Label htmlFor={checkboxId} className='text-sm font-normal'>
          {t('Include detail rows')}
        </Label>
      </div>
      <Button
        variant='outline'
        size='sm'
        onClick={() => void handleExport()}
        disabled={props.disabled || exporting || !usageScopeReady(props)}
      >
        <Download className='h-4 w-4' />
        {exporting ? t('Exporting...') : t('Export CSV')}
      </Button>
    </div>
  )
}
