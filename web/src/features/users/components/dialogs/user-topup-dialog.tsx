/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
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
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'

import { adminTopupUser } from '../../api'
import { ERROR_MESSAGES, MANUAL_TOPUP_METHODS } from '../../constants'
import type { ManualTopupPaymentMethod } from '../../types'
import { useUsers } from '../users-provider'

type UserTopupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: number; username: string }
  onSuccess: () => void
}

const METHOD_VALUES = Object.keys(
  MANUAL_TOPUP_METHODS
) as ManualTopupPaymentMethod[]

type Values = {
  amount_usd: number
  payment_method: ManualTopupPaymentMethod
  reference: string
}

const DEFAULT_VALUES: Values = {
  amount_usd: 0,
  payment_method: 'bank_transfer',
  reference: '',
}

const FORM_ID = 'user-topup-form'

/** 管理员手动为用户充值：二次验证后提交，效果等同一笔已成功的在线充值 */
export function UserTopupDialog(props: UserTopupDialogProps) {
  const { t } = useTranslation()
  const { requestVerification, verificationActive } = useUsers()
  const schema = useMemo(
    () =>
      z.object({
        amount_usd: z.number().positive(t('Top-up amount must be positive')),
        payment_method: z.enum(METHOD_VALUES),
        reference: z
          .string()
          .trim()
          .max(128, t('Reference must be at most 128 characters')),
      }),
    [t]
  )
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })
  const isSubmitting = form.formState.isSubmitting

  // 关闭后清空，下次打开不残留上一个用户的金额
  useEffect(() => {
    if (!props.open) form.reset(DEFAULT_VALUES)
  }, [props.open, form])

  const onSubmit = async (values: Values) => {
    try {
      const proof = await requestVerification({
        scope: 'admin.user.manage',
        context: { user_id: props.user.id, action: 'topup' },
        title: t('Verify to top up user'),
        description: t(
          'Confirm your identity before changing the account {{username}}.',
          { username: props.user.username }
        ),
      })
      if (!proof) return
      const result = await adminTopupUser(
        { user_id: props.user.id, ...values },
        proof.proof_token
      )
      if (!result.success) {
        handleServerError(result, t('Failed to top up user'))
        return
      }
      toast.success(t('Top-up registered'))
      props.onSuccess()
      props.onOpenChange(false)
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error),
        t(ERROR_MESSAGES.UNEXPECTED)
      )
    }
  }

  return (
    <Dialog
      open={props.open && !verificationActive}
      onOpenChange={props.onOpenChange}
      title={t('Top up user')}
      description={t(
        'Record a manual top-up for {{username}}. The balance is credited immediately and a top-up record is kept.',
        { username: props.user.username }
      )}
      contentClassName='sm:max-w-md'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form={FORM_ID} disabled={isSubmitting}>
            {isSubmitting ? t('Saving...') : t('Register top-up')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={FORM_ID}
          className='flex flex-col gap-4'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormField
            control={form.control}
            name='amount_usd'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Amount (USD)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={0}
                    step='0.01'
                    value={field.value}
                    onChange={(event) =>
                      field.onChange(Number.parseFloat(event.target.value) || 0)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='payment_method'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Payment method')}</FormLabel>
                <Select
                  items={METHOD_VALUES.map((value) => ({
                    value,
                    label: t(MANUAL_TOPUP_METHODS[value].labelKey),
                  }))}
                  value={field.value}
                  onValueChange={(value) =>
                    value !== null && field.onChange(value)
                  }
                >
                  <FormControl>
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {METHOD_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(MANUAL_TOPUP_METHODS[value].labelKey)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='reference'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Reference')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={t('Transfer / receipt number')}
                  />
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
