import { zodResolver } from '@hookform/resolvers/zod'
import { Check, QrCode } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

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
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { submitTrialLead } from '../api'
import { LEAD_VOLUMES } from '../content'
import { useReveal } from '../hooks/use-reveal'
import {
  createTrialLeadSchema,
  type TrialLeadFormValues,
} from '../lib/lead-form'
import { Eyebrow, Panel } from './landing-primitives'

function TrialLeadForm(props: { onSubmitted: (contact: string) => void }) {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<TrialLeadFormValues>({
    resolver: zodResolver(
      createTrialLeadSchema({
        companyRequired: t('Please enter your company name'),
        contactRequired: t('Please enter your WeChat ID or phone number'),
      })
    ),
    defaultValues: { company: '', contact: '', volume: '1k_10k' },
  })

  const onSubmit = async (values: TrialLeadFormValues) => {
    setSubmitting(true)
    try {
      const res = await submitTrialLead(values)
      if (!res.success) {
        handleServerError(
          createServerError(res, t('Failed to submit the request'))
        )
        return
      }
      props.onSubmitted(values.contact)
    } catch (error) {
      handleServerError(error, t('Failed to submit the request'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className='flex flex-col gap-5'
        noValidate
      >
        <FormField
          control={form.control}
          name='company'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Company name')}</FormLabel>
              <FormControl>
                <Input
                  className='h-11'
                  placeholder={t('e.g. Acme Technology Co., Ltd.')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='contact'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('WeChat ID or phone number')}</FormLabel>
              <FormControl>
                <Input
                  className='h-11'
                  placeholder={t('So our account manager can reach you')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='volume'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Estimated monthly usage')}</FormLabel>
              <FormControl>
                <div
                  role='radiogroup'
                  aria-label={t('Estimated monthly usage')}
                  className='flex flex-wrap gap-2'
                >
                  {LEAD_VOLUMES.map((option) => {
                    const selected = field.value === option.value
                    return (
                      <button
                        key={option.value}
                        type='button'
                        role='radio'
                        aria-checked={selected}
                        onClick={() => field.onChange(option.value)}
                        className={cn(
                          'h-10 cursor-pointer rounded-full border px-4 font-mono text-[13px] transition-colors',
                          selected
                            ? 'bg-foreground text-background border-foreground'
                            : 'border-input text-foreground/90 hover:border-foreground bg-transparent'
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type='submit'
          size='lg'
          className='h-12 text-[15px]'
          disabled={submitting}
        >
          {t('Submit request')}
        </Button>
      </form>
    </Form>
  )
}

export function ContactSection(props: {
  onContactSales: () => void
  salesQrConfigured: boolean
}) {
  const { t } = useTranslation()
  const [submittedContact, setSubmittedContact] = useState<string | null>(null)
  const ref = useReveal<HTMLDivElement>()

  return (
    <section
      id='contact'
      className='border-border relative scroll-mt-16 overflow-hidden border-t'
    >
      <div className='tf-glow-horizon absolute inset-0' aria-hidden='true' />
      <div
        ref={ref}
        className='tf-reveal relative mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-16 px-6 py-24 md:px-8 md:py-32'
      >
        <div className='flex flex-col gap-5'>
          <Eyebrow>{t('Enterprise trial')}</Eyebrow>
          <h2 className='text-foreground m-0 text-[clamp(40px,6vw,72px)] leading-[1.1] font-medium tracking-[-0.025em]'>
            {t('Get connected today')}
          </h2>
          <p className='text-foreground/90 m-0 max-w-[440px] leading-[26px]'>
            {t(
              'We will contact you within one business day to open a trial quota.'
            )}
          </p>
          {props.salesQrConfigured && (
            <Button
              variant='outline'
              size='sm'
              className='h-10 w-fit px-4 text-sm'
              onClick={props.onContactSales}
            >
              <QrCode aria-hidden='true' />
              {t('Add our sales team on WeChat')}
            </Button>
          )}
        </div>
        <Panel className='p-5 sm:p-8'>
          {submittedContact === null ? (
            <TrialLeadForm onSubmitted={setSubmittedContact} />
          ) : (
            <div className='flex flex-col gap-4 py-6' role='status'>
              <span className='border-primary/40 bg-primary/10 flex size-10 items-center justify-center rounded-full border'>
                <Check className='text-brand-ink size-4.5' aria-hidden='true' />
              </span>
              <span className='text-foreground text-2xl tracking-[-0.3px]'>
                {t('Request received')}
              </span>
              <span className='text-foreground/90 text-sm leading-[22px]'>
                {t(
                  'Our account manager will add you on WeChat within one business day:'
                )}{' '}
                <span className='text-foreground font-mono'>
                  {submittedContact}
                </span>
              </span>
              <Button
                variant='outline'
                size='sm'
                className='h-10 w-fit px-4 text-sm'
                onClick={() => setSubmittedContact(null)}
              >
                {t('Submit another request')}
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </section>
  )
}
