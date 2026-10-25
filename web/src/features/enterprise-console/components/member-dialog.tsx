import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { createMember, updateMember } from '../api'
import { useTeamOptions } from '../hooks/use-team-options'
import type { Member } from '../types'
import { EntitySelect } from './entity-select'

type MemberDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  member?: Member
  /** 新建时默认归属的团队（0 = 默认团队） */
  defaultTeamId?: number
  /** 团队角色不能把成员挪到别的团队 */
  lockTeam?: boolean
  onSaved: () => void
}

export function MemberDialog(props: MemberDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const teamOptions = useTeamOptions()
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('Member name is required'))
          .max(64, t('Name must be at most 64 characters')),
        email: z.union([
          z.literal(''),
          z.string().trim().email(t('Invalid email address')),
        ]),
        employee_no: z.string().trim().max(64),
        team_id: z.number().int().min(0),
        active: z.boolean(),
        remark: z.string(),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      employee_no: '',
      team_id: 0,
      active: true,
      remark: '',
    },
  })

  useEffect(() => {
    if (!props.open) return
    const member = props.member
    form.reset({
      name: member?.name ?? '',
      email: member?.email ?? '',
      employee_no: member?.employee_no ?? '',
      team_id: member?.team_id ?? props.defaultTeamId ?? 0,
      active: member ? member.status === 'active' : true,
      remark: member?.remark ?? '',
    })
  }, [props.open, props.member, props.defaultTeamId, form])

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const payload = {
        name: values.name,
        email: values.email,
        employee_no: values.employee_no,
        team_id: values.team_id,
        status: values.active ? ('active' as const) : ('disabled' as const),
        remark: values.remark,
      }
      const result = props.member
        ? await updateMember(props.member.id, payload)
        : await createMember(payload)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Member saved'))
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
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.member ? t('Edit Member') : t('Add Member')}
      description={t(
        'Members call the API with the keys issued to them. Console access is optional and granted separately.'
      )}
      contentClassName='sm:max-w-lg'
      footer={
        <Button type='submit' form='member-form' disabled={isSubmitting}>
          {isSubmitting ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='member-form'
          className='flex flex-col gap-4'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Email')}</FormLabel>
                  <FormControl>
                    <Input {...field} type='email' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='employee_no'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Employee No.')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {!props.lockTeam && (
            <FormField
              control={form.control}
              name='team_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Team')}</FormLabel>
                  <EntitySelect
                    value={field.value}
                    onChange={field.onChange}
                    options={teamOptions}
                    noneLabel={t('Default team')}
                    aria-label={t('Team')}
                  />
                  {props.member && props.member.token_count > 0 && (
                    <FormDescription>
                      {t(
                        'Moving a member also moves their API keys to the new team.'
                      )}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {props.member && (
            <FormField
              control={form.control}
              name='active'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between gap-4'>
                  <div>
                    <FormLabel>{t('Active')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Disabling a member also disables all of their API keys.'
                      )}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name='remark'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Remark')}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
