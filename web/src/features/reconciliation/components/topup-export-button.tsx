import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  buildUsageCsvFilename,
  readBlobError,
  saveBlob,
} from '@/features/finance/lib/csv'
import { handleServerError } from '@/lib/handle-server-error'

import { downloadTopupExport } from '../api'

type TopupExportButtonProps = {
  ts_start: number
  ts_end: number
  /** CSV 文件名里的主体与账期 */
  subject: string
  startDay: string
  endDay: string
}

/** 充值账单导出 CSV（无明细勾选，流水本身就是明细） */
export function TopupExportButton(props: TopupExportButtonProps) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await downloadTopupExport({
        ts_start: props.ts_start,
        ts_end: props.ts_end,
      })
      const message = await readBlobError(blob)
      if (message) {
        toast.error(message)
        return
      }
      saveBlob(
        blob,
        buildUsageCsvFilename(
          props.subject,
          props.startDay,
          props.endDay,
          t('Wallet statement')
        )
      )
    } catch (error) {
      handleServerError(error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button
      variant='outline'
      size='sm'
      onClick={() => void handleExport()}
      disabled={exporting}
    >
      <Download className='h-4 w-4' />
      {exporting ? t('Exporting...') : t('Export CSV')}
    </Button>
  )
}
