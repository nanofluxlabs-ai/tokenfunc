import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { Bill } from '@/features/enterprise-console/types'
import { ackReconcileAlert } from '@/features/enterprises/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { FINANCE_QUERY_KEY } from '../../constants'

/** 账单详情顶部的对账差异提示；未核对时给「标记已核对」按钮，弹窗由父级在布局槽位外渲染 */
export function ReconcileDiffAlert(props: { bill: Bill; onAck: () => void }) {
  const { t } = useTranslation()
  const bill = props.bill
  if (bill.bill_type !== 'credit' || bill.reconcile_diff_quota === 0) {
    return null
  }
  const acked = bill.reconcile_acked_at > 0
  return (
    <Alert className={acked ? undefined : 'border-warning/40 bg-warning/10'}>
      <AlertTitle>{t('Reconciliation difference')}</AlertTitle>
      <AlertDescription>
        <p>
          {t(
            'The period counter ({{counter}}) and the usage details ({{detail}}) differ by {{diff}}. The bill was issued from the counter.',
            {
              counter: formatQuotaWithCurrency(bill.amount_quota),
              detail: formatQuotaWithCurrency(
                bill.amount_quota - bill.reconcile_diff_quota
              ),
              diff: formatQuotaWithCurrency(bill.reconcile_diff_quota),
            }
          )}
        </p>
        {acked ? (
          <p>
            {t('Reconciled by #{{id}} on {{date}}', {
              id: bill.reconcile_acked_by,
              date: formatTimestampToDate(bill.reconcile_acked_at),
            })}
            {bill.reconcile_ack_note ? ` · ${bill.reconcile_ack_note}` : ''}
          </p>
        ) : (
          <div>
            <Button variant='outline' size='sm' onClick={props.onAck}>
              {t('Mark as reconciled')}
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

type ReconcileAckDialogProps = {
  bill: Bill | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 「标记已核对」确认框：可选备注，成功后刷新财务账单详情与企业账单列表 */
export function ReconcileAckDialog(props: ReconcileAckDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const ack = useMutation({
    mutationFn: async (bill: Bill) =>
      requireServerSuccess(await ackReconcileAlert(bill.id, note)),
    onSuccess: () => {
      toast.success(t('Reconciliation difference marked as reviewed'))
      setNote('')
      props.onOpenChange(false)
      void queryClient.invalidateQueries({
        queryKey: [FINANCE_QUERY_KEY, 'bill'],
      })
      void queryClient.invalidateQueries({ queryKey: ['admin-enterprise'] })
    },
    onError: (error) =>
      handleServerError(error, t('Failed to mark as reconciled')),
  })
  return (
    <ConfirmDialog
      open={props.open && props.bill !== null}
      onOpenChange={(open) => {
        if (!open) setNote('')
        props.onOpenChange(open)
      }}
      title={t('Mark as reconciled')}
      desc={
        props.bill
          ? `${props.bill.bill_no} · ${t('Confirm that the difference has been reviewed. The bill amount stays as issued.')}`
          : ''
      }
      confirmText={t('Mark as reconciled')}
      isLoading={ack.isPending}
      handleConfirm={() => {
        if (props.bill) ack.mutate(props.bill)
      }}
    >
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t('Note (optional)')}
        rows={2}
        aria-label={t('Note (optional)')}
      />
    </ConfirmDialog>
  )
}
