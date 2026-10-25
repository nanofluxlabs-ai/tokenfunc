import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { createPromoter } from '../api'
import { EMPTY_PROMOTER_FIELDS } from '../constants'
import type { PickedUser, PromoterEditableFields } from '../types'
import { PromoterFields } from './promoter-fields'
import { usePromoters } from './promoters-provider'
import { UserPicker } from './user-picker'

type AddPromoterDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 管理员：把已有普通用户设为推广人 */
export function AddPromoterDialog(props: AddPromoterDialogProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = usePromoters()
  const [user, setUser] = useState<PickedUser | null>(null)
  const [fields, setFields] = useState<PromoterEditableFields>(
    EMPTY_PROMOTER_FIELDS
  )

  const close = () => {
    setUser(null)
    setFields(EMPTY_PROMOTER_FIELDS)
    props.onOpenChange(false)
  }
  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('Select user'))
      return requireServerSuccess(
        await createPromoter({
          user_id: user.id,
          remark: fields.remark.trim(),
          share_rate: fields.share_rate,
        })
      )
    },
    onSuccess: () => {
      toast.success(t('Promoter added'))
      triggerRefresh()
      close()
    },
    onError: (error) => handleServerError(error, t('Failed to add promoter')),
  })

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => (open ? props.onOpenChange(true) : close())}
      title={t('Add Promoter')}
      description={t(
        'Pick an existing regular user. Users who sign up through their referral link will be bound to them automatically.'
      )}
      footer={
        <>
          <Button variant='outline' onClick={close}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!user || mutation.isPending}
          >
            {t('Add Promoter')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='promoter-user'>{t('User')}</Label>
          <UserPicker id='promoter-user' value={user} onChange={setUser} />
        </div>
        <PromoterFields value={fields} onChange={setFields} />
      </div>
    </Dialog>
  )
}
