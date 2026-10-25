import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { type Control, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { PasswordInput } from '@/components/password-input'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { createEnterprise, updateEnterprise } from '../api'
import { MAX_ENTERPRISE_TOKENS, SUCCESS_MESSAGES } from '../constants'
import {
  ENTERPRISE_FORM_DEFAULT_VALUES,
  type EnterpriseFormValues,
  enterpriseToFormValues,
  formValuesToCreatePayload,
  formValuesToProfilePayload,
  getEnterpriseFormSchema,
} from '../lib/enterprise-form'
import type { EnterpriseListItem } from '../types'
import { useEnterprises } from './enterprises-provider'

type TextFieldName = Exclude<
  keyof EnterpriseFormValues,
  'mode' | 'payment_terms_days' | 'max_tokens'
>

function TextField(props: {
  control: Control<EnterpriseFormValues>
  name: TextFieldName
  label: string
  placeholder?: string
  description?: string
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Input {...field} placeholder={props.placeholder} />
          </FormControl>
          {props.description && (
            <FormDescription>{props.description}</FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

type EnterpriseMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: EnterpriseListItem
}

export function EnterpriseMutateDrawer(props: EnterpriseMutateDrawerProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useEnterprises()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const currentRow = props.currentRow
  const isUpdate = currentRow !== undefined

  const schema = useMemo(
    () => getEnterpriseFormSchema(t, isUpdate),
    [t, isUpdate]
  )
  const form = useForm<EnterpriseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: ENTERPRISE_FORM_DEFAULT_VALUES,
  })
  const mode = useWatch({ control: form.control, name: 'mode' })

  useEffect(() => {
    if (!props.open) return
    form.reset(
      currentRow
        ? enterpriseToFormValues(currentRow)
        : ENTERPRISE_FORM_DEFAULT_VALUES
    )
  }, [props.open, currentRow, form])

  const onSubmit = async (values: EnterpriseFormValues) => {
    setIsSubmitting(true)
    try {
      const result = currentRow
        ? await updateEnterprise(
            currentRow.id,
            formValuesToProfilePayload(values)
          )
        : await createEnterprise(formValuesToCreatePayload(values))
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(
        t(
          currentRow
            ? SUCCESS_MESSAGES.ENTERPRISE_UPDATED
            : SUCCESS_MESSAGES.ENTERPRISE_CREATED
        )
      )
      props.onOpenChange(false)
      triggerRefresh()
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[640px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {isUpdate ? t('Edit Enterprise') : t('Create Enterprise')}
          </SheetTitle>
          <SheetDescription>
            {isUpdate
              ? t('Update the enterprise profile and billing information.')
              : t(
                  'Create a new enterprise owner account, or upgrade an existing common user.'
                )}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='enterprise-form'
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
            className={sideDrawerFormClassName()}
          >
            <fieldset disabled={isSubmitting} className='contents'>
              {!isUpdate && (
                <SideDrawerSection>
                  <SideDrawerSectionHeader
                    title={t('Owner Account')}
                    description={t(
                      'The owner account signs in to manage employees, API keys and bills. All API keys of the enterprise are billed to this account.'
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='mode'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Account Source')}</FormLabel>
                        <Select
                          items={[
                            {
                              value: 'new_user',
                              label: t('Create a new account'),
                            },
                            {
                              value: 'upgrade',
                              label: t('Upgrade an existing user'),
                            },
                          ]}
                          value={field.value}
                          onValueChange={(value) =>
                            value !== null && field.onChange(value)
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent alignItemWithTrigger={false}>
                            <SelectGroup>
                              <SelectItem value='new_user'>
                                {t('Create a new account')}
                              </SelectItem>
                              <SelectItem value='upgrade'>
                                {t('Upgrade an existing user')}
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {mode === 'new_user' ? (
                    <>
                      <TextField
                        control={form.control}
                        name='username'
                        label={t('Username')}
                      />
                      <FormField
                        control={form.control}
                        name='password'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('Password')}</FormLabel>
                            <FormControl>
                              <PasswordInput
                                {...field}
                                autoComplete='new-password'
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <TextField
                        control={form.control}
                        name='display_name'
                        label={t('Display Name')}
                      />
                    </>
                  ) : (
                    <TextField
                      control={form.control}
                      name='user_id'
                      label={t('User ID')}
                      description={t(
                        'Only enabled common users can be upgraded. Their balance and history are kept.'
                      )}
                    />
                  )}
                </SideDrawerSection>
              )}

              <SideDrawerSection>
                <SideDrawerSectionHeader title={t('Enterprise Profile')} />
                <TextField
                  control={form.control}
                  name='name'
                  label={t('Enterprise Name')}
                />
                <TextField
                  control={form.control}
                  name='contact_name'
                  label={t('Contact Name')}
                />
                <TextField
                  control={form.control}
                  name='contact_email'
                  label={t('Contact Email')}
                />
                <TextField
                  control={form.control}
                  name='contact_phone'
                  label={t('Contact Phone')}
                />
                <FormField
                  control={form.control}
                  name='payment_terms_days'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Payment Terms (days)')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          max={365}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(
                              Number.parseInt(event.target.value, 10) || 0
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Bills are due this many days after issue.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='max_tokens'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Max API Keys')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          max={MAX_ENTERPRISE_TOKENS}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(
                              Number.parseInt(event.target.value, 10) || 0
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {t('0 means the site-wide per-user limit applies.')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SideDrawerSection>

              <SideDrawerSection>
                <SideDrawerSectionHeader
                  title={t('Billing Profile')}
                  description={t('Printed on bills and invoices as the buyer.')}
                />
                <TextField
                  control={form.control}
                  name='company_name'
                  label={t('Company Legal Name')}
                />
                <TextField
                  control={form.control}
                  name='tax_id'
                  label={t('Tax ID')}
                />
                <TextField
                  control={form.control}
                  name='address'
                  label={t('Address')}
                />
                <TextField
                  control={form.control}
                  name='country'
                  label={t('Country / Region')}
                />
                <TextField
                  control={form.control}
                  name='billing_email'
                  label={t('Billing Email')}
                />
                <TextField
                  control={form.control}
                  name='phone'
                  label={t('Phone')}
                />
              </SideDrawerSection>

              <SideDrawerSection>
                <FormField
                  control={form.control}
                  name='remark'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Internal Remark')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SideDrawerSection>
            </fieldset>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Cancel')}
          </SheetClose>
          <Button form='enterprise-form' type='submit' disabled={isSubmitting}>
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
