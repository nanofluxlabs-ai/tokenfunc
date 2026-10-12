import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { MetricCard } from '@/features/finance/components/metric-card'
import { SectionBlock } from '@/features/finance/components/section-block'
import {
  buildUsageCsvFilename,
  readBlobError,
  saveBlob,
} from '@/features/finance/lib/csv'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { downloadTopupExport } from '../api'
import { useTopupSummary } from '../hooks/use-topup-queries'
import { formatSignedUsd } from '../lib/topup-display'
import { TopupDetailTable } from './topup-detail-table'
import { TopupSourceTable } from './topup-source-table'

type TopupTabProps = {
  ts_start: number
  ts_end: number
  /** CSV 文件名里的主体与账期 */
  subject: string
  startDay: string
  endDay: string
}

/** 充值账单：汇总卡 + 导出 + 按来源汇总 + 充值明细 */
export function TopupTab(props: TopupTabProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const summary = useTopupSummary({
    ts_start: props.ts_start,
    ts_end: props.ts_end,
  })
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
    <div className='flex flex-col gap-4'>
      <div className='flex justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void handleExport()}
          disabled={exporting}
        >
          <Download className='h-4 w-4' />
          {exporting ? t('Exporting...') : t('Export CSV')}
        </Button>
      </div>
      <div className='grid gap-3 sm:grid-cols-3'>
        <MetricCard
          label={t('Entries')}
          value={formatNumber(summary.data?.total_entries ?? 0, locale)}
          loading={summary.isLoading}
        />
        <MetricCard
          label={t('Net amount (USD)')}
          value={formatSignedUsd(summary.data?.total_amount_usd ?? '0.000000')}
          loading={summary.isLoading}
        />
        <MetricCard
          label={t('Sources')}
          value={summary.data?.by_source.length ?? 0}
          loading={summary.isLoading}
        />
      </div>
      <Alert className='bg-muted/40'>
        <AlertDescription>
          {t(
            'Wallet entries are the non-consumption movements of your wallet: online top-ups, redemption codes, enterprise offline top-ups, admin adjustments, refunds and subscriptions paid by balance. Subscriptions paid online do not change the wallet.'
          )}
        </AlertDescription>
      </Alert>
      <SectionBlock title={t('Summary by source')}>
        <TopupSourceTable
          rows={summary.data?.by_source ?? []}
          isLoading={summary.isLoading}
        />
      </SectionBlock>
      <SectionBlock title={t('Wallet entries')}>
        <div className='p-2'>
          <TopupDetailTable ts_start={props.ts_start} ts_end={props.ts_end} />
        </div>
      </SectionBlock>
    </div>
  )
}
