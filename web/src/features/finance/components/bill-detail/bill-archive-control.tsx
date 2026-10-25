import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import type { Bill } from '@/features/enterprise-console/types'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { archiveFinanceBill, downloadFinanceBillArchive } from '../../api'
import { FINANCE_QUERY_KEY } from '../../constants'
import { readBlobError, saveBlob } from '../../lib/csv'
import type { BillArchiveFile } from '../../types'

/** 账单账期包：已归档时给两个下载按钮，否则给「归档到对象存储」 */
export function BillArchiveControl(props: { bill: Bill }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [downloading, setDownloading] = useState<BillArchiveFile | null>(null)

  const archive = useMutation({
    mutationFn: async () =>
      requireServerSuccess(await archiveFinanceBill(props.bill.id)),
    onSuccess: () => {
      toast.success(t('Bill archived to object storage'))
      void queryClient.invalidateQueries({
        queryKey: [FINANCE_QUERY_KEY, 'bill'],
      })
    },
    onError: (error) => handleServerError(error, t('Failed to archive bill')),
  })

  const download = async (file: BillArchiveFile) => {
    setDownloading(file)
    try {
      const blob = await downloadFinanceBillArchive(props.bill.id, file)
      const message = await readBlobError(blob)
      if (message) {
        toast.error(message)
        return
      }
      saveBlob(blob, `${props.bill.bill_no}-${file}.csv.gz`)
    } catch (error) {
      handleServerError(error, t('Download failed'))
    } finally {
      setDownloading(null)
    }
  }

  if (props.bill.archived_at > 0) {
    return (
      <>
        <StatusBadge
          label={`${t('Archived')} · ${formatTimestampToDate(props.bill.archived_at).slice(0, 10)}`}
          variant='success'
          copyable={false}
        />
        <Button
          variant='outline'
          size='sm'
          disabled={downloading !== null}
          onClick={() => void download('statement')}
        >
          <Download className='h-4 w-4' />
          {t('Statement snapshot')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={downloading !== null}
          onClick={() => void download('raw-logs')}
        >
          <Download className='h-4 w-4' />
          {t('Raw logs')}
        </Button>
      </>
    )
  }
  return (
    <Button
      variant='outline'
      size='sm'
      disabled={archive.isPending}
      onClick={() => archive.mutate()}
    >
      <Archive className='h-4 w-4' />
      {archive.isPending ? t('Archiving...') : t('Archive to object storage')}
    </Button>
  )
}
