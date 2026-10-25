import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'

import { setMemberRole } from '../api'
import type { Team } from '../types'
import { MemberPicker } from './member-picker'

type TeamAdminDialogProps = {
  team: Team | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

/** 设团队管理员：从本团队已开通登录的成员里选一个，把角色置为 team_admin */
export function TeamAdminDialog(props: TeamAdminDialogProps) {
  const { t } = useTranslation()
  const [memberId, setMemberId] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setMemberId(0)
  }, [props.team])

  const handleSave = async () => {
    if (!props.team || memberId <= 0) return
    setIsSubmitting(true)
    try {
      const result = await setMemberRole(memberId, 'team_admin')
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Role updated'))
      props.onOpenChange(false)
      props.onSaved()
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={props.team !== null}
      onOpenChange={props.onOpenChange}
      title={t('Set team admin')}
      description={t(
        'Only members who already have console access can be made team admins. Grant access from the member row first.'
      )}
      contentClassName='sm:max-w-md'
      footer={
        <Button
          onClick={() => void handleSave()}
          disabled={isSubmitting || memberId <= 0}
        >
          {isSubmitting ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <div className='flex flex-col gap-2'>
        <Label htmlFor='team-admin-member'>{t('Member')}</Label>
        <MemberPicker
          id='team-admin-member'
          value={memberId}
          onChange={setMemberId}
          teamId={props.team?.id}
          hasLogin
          noneLabel={t('Select a member')}
        />
      </div>
    </Dialog>
  )
}
