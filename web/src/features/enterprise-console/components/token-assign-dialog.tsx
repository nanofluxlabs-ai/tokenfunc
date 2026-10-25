import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'

import { updateTokenAssignment } from '../api'
import { useTeamOptions } from '../hooks/use-team-options'
import type { EnterpriseToken } from '../types'
import { EntitySelect } from './entity-select'
import { MemberPicker } from './member-picker'

type TokenAssignDialogProps = {
  token: EnterpriseToken | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function TokenAssignDialog(props: TokenAssignDialogProps) {
  const { t } = useTranslation()
  const teamOptions = useTeamOptions()
  const [teamId, setTeamId] = useState(0)
  const [memberId, setMemberId] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setTeamId(props.token?.team_id ?? 0)
    setMemberId(props.token?.member_id ?? 0)
  }, [props.token])

  const handleSave = async () => {
    if (!props.token) return
    setIsSubmitting(true)
    try {
      const result = await updateTokenAssignment(props.token.id, {
        team_id: teamId,
        member_id: memberId,
      })
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Assignment updated'))
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
      open={props.token !== null}
      onOpenChange={props.onOpenChange}
      title={t('Assign API Key')}
      description={t(
        'Changes apply to future requests only. Past usage keeps its original attribution.'
      )}
      contentClassName='sm:max-w-md'
      footer={
        <Button onClick={() => void handleSave()} disabled={isSubmitting}>
          {isSubmitting ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='assign-team'>{t('Team')}</Label>
          <EntitySelect
            id='assign-team'
            value={teamId}
            onChange={(value) => {
              setTeamId(value)
              // 换团队后持有人要重选
              setMemberId(0)
            }}
            options={teamOptions}
            noneLabel={t('Default team')}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='assign-member'>{t('Holder')}</Label>
          <MemberPicker
            id='assign-member'
            value={memberId}
            onChange={setMemberId}
            teamId={teamId}
            selectedLabel={
              memberId === props.token?.member_id
                ? props.token?.member_name
                : undefined
            }
            noneLabel={t('Team key (no holder)')}
          />
        </div>
      </div>
    </Dialog>
  )
}
