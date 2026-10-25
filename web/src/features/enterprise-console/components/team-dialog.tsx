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
import { getCurrencyDisplay } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'

import { createTeam, updateTeam } from '../api'
import type { Team } from '../types'

type TeamDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 编辑的团队；为空表示新建 */
  team?: Team
  onSaved: () => void
}

export function TeamDialog(props: TeamDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 预算以 USD 存储（quota / quotaPerUnit），与授信额度同一口径
  const quotaPerUnit = getCurrencyDisplay().config.quotaPerUnit
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('Team name is required'))
          .max(64, t('Name must be at most 64 characters')),
        monthly_budget_usd: z.number().min(0, t('Budget cannot be negative')),
        budget_alert_percent: z
          .number()
          .int()
          .min(0)
          .max(99, t('Alert threshold must be between 0 and 99')),
        budget_enforce: z.boolean(),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      monthly_budget_usd: 0,
      budget_alert_percent: 80,
      budget_enforce: false,
    },
  })

  useEffect(() => {
    if (!props.open) return
    form.reset({
      name: props.team?.name ?? '',
      monthly_budget_usd: props.team
        ? props.team.monthly_budget_quota / quotaPerUnit
        : 0,
      budget_alert_percent: props.team?.budget_alert_percent ?? 80,
      budget_enforce: props.team?.budget_enforce ?? false,
    })
  }, [props.open, props.team, form, quotaPerUnit])

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const payload = { ...values, sort: props.team?.sort ?? 0 }
      const result = props.team
        ? await updateTeam(props.team.id, payload)
        : await createTeam(payload)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Team saved'))
      props.onOpenChange(false)
      props.onSaved()
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const numberField = (
    field: { value: number; onChange: (value: number) => void },
    step: string
  ) => (
    <Input
      type='number'
      min={0}
      step={step}
      value={field.value}
      onChange={(event) =>
        field.onChange(Number.parseFloat(event.target.value) || 0)
      }
    />
  )

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.team ? t('Edit Team') : t('Add Team')}
      description={t(
        'Members and API keys belong to a team. A monthly budget of 0 means no budget.'
      )}
      contentClassName='sm:max-w-md'
      footer={
        <Button type='submit' form='team-form' disabled={isSubmitting}>
          {isSubmitting ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='team-form'
          className='flex flex-col gap-4'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Team Name')}</FormLabel>
                <FormControl>
                  <Input {...field} disabled={props.team?.is_default} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='monthly_budget_usd'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Monthly Budget (USD)')}</FormLabel>
                  <FormControl>{numberField(field, '0.01')}</FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='budget_alert_percent'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Alert at (%)')}</FormLabel>
                  <FormControl>{numberField(field, '1')}</FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name='budget_enforce'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between gap-4'>
                <div>
                  <FormLabel>{t('Block requests over budget')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Off: only notify when the budget is reached. On: reject requests from this team for the rest of the month.'
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
        </form>
      </Form>
    </Dialog>
  )
}
