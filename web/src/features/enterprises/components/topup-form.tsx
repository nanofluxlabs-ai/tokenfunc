import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { registerEnterpriseTopup } from '../api'

type TopupFormProps = {
  enterpriseId: number
  onSaved: () => void
}

/** 预付企业：登记线下转账充值 */
export function TopupForm(props: TopupFormProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const schema = useMemo(
    () =>
      z.object({
        amount_usd: z.number().positive(t('Top-up amount must be positive')),
        reference: z
          .string()
          .trim()
          .max(128, t('Reference must be at most 128 characters')),
        remark: z.string().trim(),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount_usd: 0, reference: '', remark: '' },
  })

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const result = await registerEnterpriseTopup(props.enterpriseId, values)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Top-up registered'))
      form.reset({ amount_usd: 0, reference: '', remark: '' })
      props.onSaved()
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-4'
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      >
        <div className='grid gap-4 sm:grid-cols-2'>
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
            name='reference'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Bank reference')}</FormLabel>
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
        </div>
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
        <div className='flex justify-end'>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting ? t('Saving...') : t('Register top-up')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
