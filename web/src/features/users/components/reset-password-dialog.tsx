import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'

import { resetUserPassword, type ResetUserPasswordResult } from '../api'
import { useUsers } from './users-provider'

type ResetPasswordDialogProps = {
  user: { id: number; username: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

/**
 * 管理员重置密码（个人用户与企业主共用）：确认 → 二次验证 → 随机生成新密码并只展示一次，
 * 交互与企业控制台的成员密码重置一致
 */
export function ResetPasswordDialog(props: ResetPasswordDialogProps) {
  const { t } = useTranslation()
  const { requestVerification, verificationActive } = useUsers()
  const [credential, setCredential] = useState<ResetUserPasswordResult | null>(
    null
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  const close = () => {
    setCredential(null)
    props.onOpenChange(false)
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      const proof = await requestVerification({
        scope: 'admin.user.password.reset',
        context: { user_id: props.user.id },
        title: t('Verify to reset password'),
        description: t(
          'Confirm your identity before changing the account {{username}}.',
          { username: props.user.username }
        ),
      })
      if (!proof) {
        close()
        return
      }
      const result = await resetUserPassword(props.user.id, proof.proof_token)
      if (result.success && result.data) {
        setCredential(result.data)
        props.onSuccess?.()
      } else {
        handleServerError(result, t('Failed to reset password'))
        close()
      }
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error),
        t('Failed to reset password')
      )
      close()
    } finally {
      setIsSubmitting(false)
    }
  }

  if (credential) {
    return (
      <Dialog
        open={props.open}
        onOpenChange={(isOpen) => !isOpen && close()}
        title={t('Password reset')}
        description={t(
          'The user must sign in again everywhere: active sessions and access tokens are revoked. The new password is shown only once.'
        )}
        contentClassName='sm:max-w-md'
        footer={<Button onClick={close}>{t('Done')}</Button>}
      >
        <div className='flex flex-col gap-3'>
          <div className='bg-muted flex items-center gap-2 rounded-md p-3'>
            <div className='min-w-0 flex-1'>
              <div className='text-muted-foreground text-xs'>
                {t('Username')}
              </div>
              <code className='font-mono text-sm break-all'>
                {credential.username}
              </code>
            </div>
            <CopyButton
              value={credential.username}
              aria-label={t('Copy username')}
            />
          </div>
          <div className='bg-muted flex items-center gap-2 rounded-md p-3'>
            <div className='min-w-0 flex-1'>
              <div className='text-muted-foreground text-xs'>
                {t('New password')}
              </div>
              <code className='font-mono text-sm break-all'>
                {credential.password}
              </code>
            </div>
            <CopyButton
              value={credential.password}
              aria-label={t('Copy password')}
            />
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <ConfirmDialog
      open={props.open && !verificationActive}
      onOpenChange={(isOpen) => !isOpen && close()}
      title={t('Reset password')}
      desc={t(
        'Reset password for {{username}}? A new random password will be generated and all of their sessions will be signed out.',
        { username: props.user.username }
      )}
      confirmText={t('Reset password')}
      isLoading={isSubmitting}
      handleConfirm={handleConfirm}
    />
  )
}
