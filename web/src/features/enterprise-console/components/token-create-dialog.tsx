import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { CopyButton } from '@/components/copy-button'
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
import { fetchTokenKey } from '@/features/keys/api'
import { getCurrencyLabel } from '@/lib/currency'
import { parseQuotaFromDollars } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { createEnterpriseToken } from '../api'
import { useProjectOptions } from '../hooks/use-project-options'
import { EmployeePicker } from './employee-picker'
import { EntitySelect } from './entity-select'

type TokenCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function TokenCreateDialog(props: TokenCreateDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const projectOptions = useProjectOptions()
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('Key name is required'))
          .max(50, t('Name must be at most 50 characters')),
        employee_id: z.number().int().min(0),
        project_id: z.number().int().min(0),
        unlimited_quota: z.boolean(),
        quota_dollars: z.number().min(0, t('Quota cannot be negative')),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      employee_id: 0,
      project_id: 0,
      unlimited_quota: true,
      quota_dollars: 0,
    },
  })
  const unlimited = useWatch({ control: form.control, name: 'unlimited_quota' })

  useEffect(() => {
    if (!props.open) return
    setCreatedKey(null)
    form.reset({
      name: '',
      employee_id: 0,
      project_id: 0,
      unlimited_quota: true,
      quota_dollars: 0,
    })
  }, [props.open, form])

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const result = await createEnterpriseToken({
        name: values.name,
        employee_id: values.employee_id,
        project_id: values.project_id,
        unlimited_quota: values.unlimited_quota,
        remain_quota: values.unlimited_quota
          ? 0
          : parseQuotaFromDollars(values.quota_dollars),
        expired_time: -1,
      })
      if (!result.success || !result.data) {
        handleServerError(result)
        return
      }
      props.onCreated()
      const keyResult = await fetchTokenKey(result.data.id)
      if (keyResult.success && keyResult.data) {
        setCreatedKey(`sk-${keyResult.data.key}`)
      } else {
        props.onOpenChange(false)
      }
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (createdKey) {
    return (
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('API Key Created')}
        description={t(
          'Copy the key and hand it to the employee through a secure channel.'
        )}
        contentClassName='sm:max-w-lg'
        footer={
          <Button onClick={() => props.onOpenChange(false)}>{t('Done')}</Button>
        }
      >
        <div className='bg-muted flex items-center gap-2 rounded-md p-3'>
          <code className='min-w-0 flex-1 font-mono text-sm break-all'>
            {createdKey}
          </code>
          <CopyButton value={createdKey} aria-label={t('Copy API key')} />
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Create API Key')}
      description={t(
        'Usage of this key is billed to the enterprise and attributed to the selected employee and project.'
      )}
      contentClassName='sm:max-w-lg'
      footer={
        <Button
          type='submit'
          form='enterprise-token-form'
          disabled={isSubmitting}
        >
          {isSubmitting ? t('Creating...') : t('Create')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='enterprise-token-form'
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
          <FormField
            control={form.control}
            name='employee_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Employee')}</FormLabel>
                <EmployeePicker
                  value={field.value}
                  onChange={field.onChange}
                  noneLabel={t('Shared (no employee)')}
                  aria-label={t('Employee')}
                />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='project_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Project')}</FormLabel>
                <EntitySelect
                  value={field.value}
                  onChange={field.onChange}
                  options={projectOptions}
                  noneLabel={t('No project')}
                  aria-label={t('Project')}
                />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='unlimited_quota'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between gap-4'>
                <div>
                  <FormLabel>{t('Unlimited Quota')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Spending is still limited by the enterprise balance or credit.'
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
          {!unlimited && (
            <FormField
              control={form.control}
              name='quota_dollars'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('Quota ({{currency}})', {
                      currency: getCurrencyLabel(),
                    })}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      step='0.01'
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(
                          Number.parseFloat(event.target.value) || 0
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </form>
      </Form>
    </Dialog>
  )
}
