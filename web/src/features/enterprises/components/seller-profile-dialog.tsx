import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { SellerProfile } from '@/features/enterprise-console/types'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getSellerProfile, updateSellerProfile } from '../api'

const EMPTY: SellerProfile = {
  company_name: '',
  address: '',
  tax_id: '',
  email: '',
  phone: '',
  bank_name: '',
  bank_account_name: '',
  bank_account_no: '',
  swift_code: '',
  payment_notes: '',
  footer_notes: '',
  logo_url: '',
}

const TEXT_FIELDS: { name: keyof SellerProfile; labelKey: string }[] = [
  { name: 'company_name', labelKey: 'Company Legal Name' },
  { name: 'tax_id', labelKey: 'Tax ID' },
  { name: 'address', labelKey: 'Address' },
  { name: 'email', labelKey: 'Billing Email' },
  { name: 'phone', labelKey: 'Phone' },
  { name: 'logo_url', labelKey: 'Logo URL' },
  { name: 'bank_name', labelKey: 'Bank' },
  { name: 'bank_account_name', labelKey: 'Account name' },
  { name: 'bank_account_no', labelKey: 'Account number' },
  { name: 'swift_code', labelKey: 'SWIFT code' },
]

/** 我方开票信息：出账时快照进账单，修改不影响已出账单 */
export function SellerProfileDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const profile = useQuery({
    queryKey: ['admin-enterprise', 'seller-profile'],
    queryFn: async () =>
      requireServerSuccess(await getSellerProfile()).data ?? EMPTY,
    enabled: props.open,
  })
  const form = useForm<SellerProfile>({ defaultValues: EMPTY })
  useEffect(() => {
    if (props.open && profile.data) form.reset({ ...EMPTY, ...profile.data })
  }, [props.open, profile.data, form])

  const onSubmit = async (values: SellerProfile) => {
    setIsSubmitting(true)
    try {
      const result = await updateSellerProfile(values)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Seller profile saved'))
      void profile.refetch()
      props.onOpenChange(false)
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
      title={t('Invoice issuer settings')}
      description={t(
        'Printed on every bill as the seller. Changes apply to bills issued from now on.'
      )}
      contentClassName='sm:max-w-xl'
      footer={
        <Button
          type='submit'
          form='seller-profile-form'
          disabled={isSubmitting}
        >
          {isSubmitting ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='seller-profile-form'
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          {TEXT_FIELDS.map((item) => (
            <FormField
              key={item.name}
              control={form.control}
              name={item.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(item.labelKey)}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          ))}
          <FormField
            control={form.control}
            name='payment_notes'
            render={({ field }) => (
              <FormItem className='sm:col-span-2'>
                <FormLabel>{t('Payment notes')}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='footer_notes'
            render={({ field }) => (
              <FormItem className='sm:col-span-2'>
                <FormLabel>{t('Footer notes')}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
