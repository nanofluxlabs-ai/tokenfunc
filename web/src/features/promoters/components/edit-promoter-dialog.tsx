import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { updatePromoter } from '../api'
import { EMPTY_PROMOTER_FIELDS } from '../constants'
import type { PromoterEditableFields, PromoterListItem } from '../types'
import { PromoterFields } from './promoter-fields'
import { usePromoters } from './promoters-provider'

type EditPromoterDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  promoter: PromoterListItem | null
}

/** 管理员：修改推广人的备注与分成比例 */
export function EditPromoterDialog(props: EditPromoterDialogProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = usePromoters()
  const [fields, setFields] = useState<PromoterEditableFields>(
    EMPTY_PROMOTER_FIELDS
  )
  const promoterId = props.promoter?.id
  const remark = props.promoter?.remark ?? ''
  const shareRate = props.promoter?.share_rate ?? 0
  // 打开时按当前行回填
  useEffect(() => {
    if (props.open && promoterId) {
      setFields({ remark, share_rate: shareRate })
    }
  }, [props.open, promoterId, remark, shareRate])

  const close = () => props.onOpenChange(false)
  const mutation = useMutation({
    mutationFn: async () => {
      if (!promoterId) throw new Error('promoter missing')
      return requireServerSuccess(
        await updatePromoter(promoterId, {
          remark: fields.remark.trim(),
          share_rate: fields.share_rate,
        })
      )
    },
    onSuccess: () => {
      toast.success(t('Promoter updated'))
      triggerRefresh()
      close()
    },
    onError: (error) =>
      handleServerError(error, t('Failed to update promoter')),
  })

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => (open ? props.onOpenChange(true) : close())}
      title={t('Edit promoter')}
      description={
        props.promoter
          ? `${props.promoter.username} #${props.promoter.user_id}`
          : undefined
      }
      footer={
        <>
          <Button variant='outline' onClick={close}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-4'>
        <PromoterFields value={fields} onChange={setFields} />
      </div>
    </Dialog>
  )
}
