import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { handleServerError } from '@/lib/handle-server-error'

import { removeMemberLogin, setMemberLogin, setMemberRole } from '../api'
import { assignableRolesFor, MEMBER_ROLE_LABELS } from '../lib/member-roles'
import type {
  EnterpriseActor,
  Member,
  MemberRole,
  ProvisionedLogin,
} from '../types'

type MemberLoginDialogProps = {
  member: Member | null
  actor: EnterpriseActor | null | undefined
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

function RoleSelect(props: {
  value: MemberRole
  onChange: (role: MemberRole) => void
  roles: MemberRole[]
  id?: string
}) {
  const { t } = useTranslation()
  return (
    <Select
      items={props.roles.map((role) => ({
        value: role,
        label: t(MEMBER_ROLE_LABELS[role]),
      }))}
      value={props.value}
      onValueChange={(value) => value && props.onChange(value as MemberRole)}
    >
      <SelectTrigger id={props.id} className='w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {props.roles.map((role) => (
            <SelectItem key={role} value={role}>
              {t(MEMBER_ROLE_LABELS[role])}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/**
 * 成员的「登录与角色」：
 * - 未绑定：绑定已有账号（邮箱 / 用户名）或一键开通新账号，并选择角色
 * - 已绑定：改角色或解绑
 * 一键开通的初始密码只在这里显示一次。
 */
export function MemberLoginDialog(props: MemberLoginDialogProps) {
  const { t } = useTranslation()
  const roles = useMemo(() => assignableRolesFor(props.actor), [props.actor])
  const [mode, setMode] = useState<'bind' | 'provision'>('bind')
  const [identifier, setIdentifier] = useState('')
  const [role, setRole] = useState<MemberRole>('developer')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [provisioned, setProvisioned] = useState<ProvisionedLogin | null>(null)
  const [confirmUnbind, setConfirmUnbind] = useState(false)

  const member = props.member
  const hasLogin = Boolean(member && member.user_id > 0)

  useEffect(() => {
    if (!member) return
    setMode(member.email ? 'provision' : 'bind')
    setIdentifier(member.email)
    setRole(
      member.role !== 'none' && roles.includes(member.role)
        ? member.role
        : (roles[0] ?? 'developer')
    )
    setProvisioned(null)
    setConfirmUnbind(false)
  }, [member, roles])

  const handleGrant = async () => {
    if (!member) return
    setIsSubmitting(true)
    try {
      const result = await setMemberLogin(member.id, {
        mode,
        identifier: mode === 'bind' ? identifier.trim() : undefined,
        role,
      })
      if (!result.success || !result.data) {
        handleServerError(result)
        return
      }
      props.onSaved()
      if (mode === 'provision') {
        setProvisioned(result.data)
      } else {
        toast.success(t('Console access granted'))
        props.onOpenChange(false)
      }
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRole = async () => {
    if (!member) return
    setIsSubmitting(true)
    try {
      const result = await setMemberRole(member.id, role)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Role updated'))
      props.onSaved()
      props.onOpenChange(false)
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUnbind = async () => {
    if (!member) return
    setIsSubmitting(true)
    try {
      const result = await removeMemberLogin(member.id)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Console access removed'))
      setConfirmUnbind(false)
      props.onSaved()
      props.onOpenChange(false)
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (provisioned) {
    return (
      <Dialog
        open={member !== null}
        onOpenChange={props.onOpenChange}
        title={t('Account created')}
        description={t(
          'Share these credentials through a secure channel. The password is shown only once.'
        )}
        contentClassName='sm:max-w-md'
        footer={
          <Button onClick={() => props.onOpenChange(false)}>{t('Done')}</Button>
        }
      >
        <div className='flex flex-col gap-3'>
          <div className='bg-muted flex items-center gap-2 rounded-md p-3'>
            <div className='min-w-0 flex-1'>
              <div className='text-muted-foreground text-xs'>
                {t('Username')}
              </div>
              <code className='font-mono text-sm break-all'>
                {provisioned.username}
              </code>
            </div>
            <CopyButton
              value={provisioned.username}
              aria-label={t('Copy username')}
            />
          </div>
          <div className='bg-muted flex items-center gap-2 rounded-md p-3'>
            <div className='min-w-0 flex-1'>
              <div className='text-muted-foreground text-xs'>
                {t('Initial password')}
              </div>
              <code className='font-mono text-sm break-all'>
                {provisioned.password}
              </code>
            </div>
            <CopyButton
              value={provisioned.password ?? ''}
              aria-label={t('Copy password')}
            />
          </div>
        </div>
      </Dialog>
    )
  }

  let description = ''
  if (member && hasLogin) {
    description = t('{{name}} signs in as {{username}}.', {
      name: member.name,
      username: member.username,
    })
  } else if (member) {
    description = t(
      'Let {{name}} sign in to the console. A developer sees only their team; admins can manage it.',
      { name: member.name }
    )
  }
  let grantLabel = t('Create account')
  if (isSubmitting) grantLabel = t('Saving...')
  else if (mode === 'bind') grantLabel = t('Bind account')

  return (
    <>
      <Dialog
        open={member !== null && !confirmUnbind}
        onOpenChange={props.onOpenChange}
        title={t('Console access')}
        description={description}
        contentClassName='sm:max-w-md'
        footer={
          hasLogin ? (
            <div className='flex w-full items-center justify-between gap-2'>
              <Button
                variant='outline'
                onClick={() => setConfirmUnbind(true)}
                disabled={isSubmitting}
              >
                {t('Remove access')}
              </Button>
              <Button
                onClick={() => void handleRole()}
                disabled={isSubmitting || role === member?.role}
              >
                {isSubmitting ? t('Saving...') : t('Save role')}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => void handleGrant()}
              disabled={
                isSubmitting ||
                roles.length === 0 ||
                (mode === 'bind' && identifier.trim() === '')
              }
            >
              {grantLabel}
            </Button>
          )
        }
      >
        <div className='flex flex-col gap-4'>
          {!hasLogin && (
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as 'bind' | 'provision')}
              className='flex flex-col gap-2'
            >
              <label className='flex items-start gap-2 text-sm'>
                <RadioGroupItem value='bind' id='login-mode-bind' />
                <span>
                  <span className='font-medium'>
                    {t('Bind an existing account')}
                  </span>
                  <span className='text-muted-foreground block text-xs'>
                    {t('The member already registered on this site.')}
                  </span>
                </span>
              </label>
              <label className='flex items-start gap-2 text-sm'>
                <RadioGroupItem value='provision' id='login-mode-provision' />
                <span>
                  <span className='font-medium'>
                    {t('Create a new account')}
                  </span>
                  <span className='text-muted-foreground block text-xs'>
                    {t(
                      'A login with a random password is created. It has no personal balance.'
                    )}
                  </span>
                </span>
              </label>
            </RadioGroup>
          )}
          {!hasLogin && mode === 'bind' && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='login-identifier'>{t('Email or username')}</Label>
              <Input
                id='login-identifier'
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete='off'
              />
            </div>
          )}
          <div className='flex flex-col gap-2'>
            <Label htmlFor='login-role'>{t('Role')}</Label>
            <RoleSelect
              id='login-role'
              value={role}
              onChange={setRole}
              roles={roles}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Developer: view own team. Team admin: manage own team. Enterprise admin: manage all teams and bills.'
              )}
            </p>
          </div>
          {hasLogin && member?.provisioned && (
            <Alert>
              <AlertDescription>
                {t(
                  'This account was created by the enterprise. Removing access disables it.'
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmUnbind}
        onOpenChange={(open) => !open && setConfirmUnbind(false)}
        title={t('Remove console access')}
        desc={t(
          'The member keeps their API keys and usage history but can no longer sign in to the enterprise console.'
        )}
        destructive
        confirmText={t('Remove access')}
        handleConfirm={() => void handleUnbind()}
      />
    </>
  )
}
