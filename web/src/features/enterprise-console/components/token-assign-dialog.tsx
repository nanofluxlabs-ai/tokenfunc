import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'

import { updateTokenAssignment } from '../api'
import { useAssignmentOptions } from '../hooks/use-assignment-options'
import type { EnterpriseToken } from '../types'
import { EntitySelect } from './entity-select'

type TokenAssignDialogProps = {
  token: EnterpriseToken | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function TokenAssignDialog(props: TokenAssignDialogProps) {
  const { t } = useTranslation()
  const { employeeOptions, projectOptions } = useAssignmentOptions()
  const [employeeId, setEmployeeId] = useState(0)
  const [projectId, setProjectId] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setEmployeeId(props.token?.employee_id ?? 0)
    setProjectId(props.token?.project_id ?? 0)
  }, [props.token])

  const handleSave = async () => {
    if (!props.token) return
    setIsSubmitting(true)
    try {
      const result = await updateTokenAssignment(props.token.id, {
        employee_id: employeeId,
        project_id: projectId,
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
          <Label htmlFor='assign-employee'>{t('Employee')}</Label>
          <EntitySelect
            id='assign-employee'
            value={employeeId}
            onChange={setEmployeeId}
            options={employeeOptions}
            noneLabel={t('Shared (no employee)')}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='assign-project'>{t('Project')}</Label>
          <EntitySelect
            id='assign-project'
            value={projectId}
            onChange={setProjectId}
            options={projectOptions}
            noneLabel={t('No project')}
          />
        </div>
      </div>
    </Dialog>
  )
}
