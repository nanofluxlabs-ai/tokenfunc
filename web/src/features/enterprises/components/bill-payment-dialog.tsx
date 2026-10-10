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
import type { Bill } from '@/features/enterprise-console/types'
import { handleServerError } from '@/lib/handle-server-error'

import { registerBillPayment } from '../api'

type BillPaymentDialogProps = {
  bill: Bill | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

/** 登记账单收款（支持部分付款，不能超过未付金额） */
export function BillPaymentDialog(props: BillPaymentDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const outstanding = props.bill
    ? Number.parseFloat(props.bill.total_usd) -
      Number.parseFloat(props.bill.paid_usd)
    : 0
  const schema = useMemo(
    () =>
      z.object({
        amount_usd: z
          .number()
          .positive(t('Payment amount must be positive'))
          .max(
            Math.max(outstanding, 0),
            t('Payment exceeds the outstanding amount')
          ),
        reference: z
          .string()
          .trim()
          .max(128, t('Reference must be at most 128 characters')),
        remark: z.string().trim(),
      }),
    [t, outstanding]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount_usd: 0, reference: '', remark: '' },
  })

  useEffect(() => {
    if (props.bill) {
      form.reset({
        amount_usd: Number(outstanding.toFixed(2)),
        reference: '',
        remark: '',
      })
    }
  }, [props.bill, outstanding, form])

  const onSubmit = async (values: Values) => {
    if (!props.bill) return
    setIsSubmitting(true)
    try {
      const result = await registerBillPayment(props.bill.id, values)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Payment registered'))
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
      open={props.bill !== null}
      onOpenChange={props.onOpenChange}
      title={t('Register payment')}
      description={
        props.bill
          ? `${props.bill.bill_no} · ${t('Outstanding')}: ${props.bill.currency} ${outstanding.toFixed(2)}`
          : undefined
      }
      contentClassName='sm:max-w-md'
      footer={
        <Button type='submit' form='bill-payment-form' disabled={isSubmitting}>
          {isSubmitting ? t('Saving...') : t('Register payment')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='bill-payment-form'
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
                <FormDescription>
                  {t(
                    'Partial payments are allowed; the bill is marked paid when fully settled.'
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
