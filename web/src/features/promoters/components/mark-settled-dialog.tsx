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
import { Textarea } from '@/components/ui/textarea'
import type { PromoterSettlementMonth } from '@/features/promoter-center/types'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { markPromoterSettled } from '../api'

type MarkSettledDialogProps = {
  promoterId: number
  month: PromoterSettlementMonth | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

/**
 * 标记某月已结算：金额可选（线下实付，只做记录）、流水号、备注。
 * 与 enterprises 的 BillPaymentDialog 同形但不能复用：那边绑定 Bill 与登记收款接口，金额必填且受未付上限约束。
 */
export function MarkSettledDialog(props: MarkSettledDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const schema = useMemo(
    () =>
      z.object({
        amount_usd: z
          .number()
          .min(0, t('Settlement amount cannot be negative'))
          .optional(),
        reference: z
          .string()
          .trim()
          .max(128, t('Reference must be at most 128 characters')),
        remark: z.string().trim().max(255, t('Remark is too long')),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount_usd: undefined, reference: '', remark: '' },
  })
  const monthKey = props.month?.month
  useEffect(() => {
    if (monthKey) {
      form.reset({ amount_usd: undefined, reference: '', remark: '' })
    }
  }, [monthKey, form])

  const onSubmit = async (values: Values) => {
    if (!props.month) return
    setIsSubmitting(true)
    try {
      const result = await markPromoterSettled(props.promoterId, {
        month: props.month.month,
        amount_usd: values.amount_usd,
        reference: values.reference,
        remark: values.remark,
      })
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Settlement marked'))
      props.onOpenChange(false)
      props.onSaved()
    } catch (error) {
      handleServerError(error, t('Failed to mark settlement'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={props.month !== null}
      onOpenChange={props.onOpenChange}
      title={t('Mark as settled')}
      description={
        props.month
          ? `${props.month.month} · ${t('Consumption')} ${formatQuota(props.month.net_quota)}`
          : undefined
      }
      contentClassName='sm:max-w-md'
      footer={
        <Button type='submit' form='mark-settled-form' disabled={isSubmitting}>
          {isSubmitting ? t('Saving...') : t('Mark as settled')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='mark-settled-form'
          className='flex flex-col gap-4'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormField
            control={form.control}
            name='amount_usd'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Settlement amount (USD, optional)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={0}
                    step='0.01'
                    value={field.value ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value
                      field.onChange(
                        raw === '' ? undefined : Number.parseFloat(raw) || 0
                      )
                    }}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Informational only. Payouts are calculated offline on net profit; the system never computes the amount.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='reference'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Bank reference')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
