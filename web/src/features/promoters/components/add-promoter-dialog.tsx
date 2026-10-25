import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { createPromoter } from '../api'
import type { PickedUser } from '../types'
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
  const [remark, setRemark] = useState('')

  const close = () => {
    setUser(null)
    setRemark('')
    props.onOpenChange(false)
  }
  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('Select user'))
      return requireServerSuccess(
        await createPromoter({ user_id: user.id, remark: remark.trim() })
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
        <div className='flex flex-col gap-2'>
          <Label htmlFor='promoter-remark'>{t('Remark')}</Label>
          <Input
            id='promoter-remark'
            value={remark}
            maxLength={255}
            onChange={(event) => setRemark(event.target.value)}
            placeholder={t('Optional, e.g. channel or contact')}
          />
        </div>
      </div>
    </Dialog>
  )
}
