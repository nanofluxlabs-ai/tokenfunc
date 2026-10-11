import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

import type { QuoteConfigEditorProps, QuoteMeta } from '../../types'

/** 报价单导出元信息：品牌、标题、域名、联系文案与默认参数 */
export function MetaEditor(props: QuoteConfigEditorProps) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        brand_name: z.string().trim().min(1, t('Required')),
        doc_title: z.string().trim().min(1, t('Required')),
        header_intro: z.string(),
        domain: z.string().trim().min(1, t('Required')),
        api_key_env_name: z.string(),
        contact_text: z.string(),
        sample_claude_model_id: z.string(),
        sample_gpt_model_id: z.string(),
        exchange_rate_note: z.string(),
        default_exchange_rate: z.number().min(1).max(20),
        default_validity_days: z.number().int().min(1).max(365),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: props.config.meta,
  })

  useEffect(() => {
    form.reset(props.config.meta)
  }, [props.config.meta, form])

  const onSubmit = async (values: Values) => {
    const meta: QuoteMeta = { ...props.config.meta, ...values }
    await props.onSave({ ...props.config, meta })
  }

  const textField = (
    name: Exclude<
      keyof Values,
      'default_exchange_rate' | 'default_validity_days'
    >,
    label: string,
    options?: { multiline?: boolean; wide?: boolean }
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={options?.wide ? 'sm:col-span-2' : undefined}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {options?.multiline ? (
              <Textarea {...field} rows={2} />
            ) : (
              <Input {...field} />
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  const numberField = (
    name: 'default_exchange_rate' | 'default_validity_days',
    label: string,
    attrs: { min: number; max: number; step: number }
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type='number'
              min={attrs.min}
              max={attrs.max}
              step={attrs.step}
              value={field.value}
              onChange={(event) => field.onChange(Number(event.target.value))}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Export metadata')}</CardTitle>
        <CardDescription>
          {t(
            'Brand, domain, contact text and default parameters; applied to the next generated quote.'
          )}
        </CardDescription>
        <CardAction>
          <Button
            type='submit'
            form='quote-meta-form'
            size='sm'
            disabled={props.saving}
          >
            <Save className='h-4 w-4' />
            {props.saving ? t('Saving...') : t('Save export metadata')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            id='quote-meta-form'
            className='grid gap-4 sm:grid-cols-2'
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
          >
            {textField('brand_name', t('Brand name'))}
            {textField('doc_title', t('Document title'))}
            {textField('domain', t('Service domain (appendix examples)'))}
            {textField(
              'api_key_env_name',
              t('API key environment variable name')
            )}
            {textField('sample_claude_model_id', t('Sample Claude model ID'))}
            {textField('sample_gpt_model_id', t('Sample GPT model ID'))}
            {numberField(
              'default_exchange_rate',
              t('Default exchange rate (1 USD = N CNY)'),
              { min: 1, max: 20, step: 0.01 }
            )}
            {numberField(
              'default_validity_days',
              t('Default validity (days)'),
              { min: 1, max: 365, step: 1 }
            )}
            {textField(
              'exchange_rate_note',
              t('Exchange rate note (billing rule #2)'),
              { wide: true }
            )}
            {textField('header_intro', t('Header intro (first sentence)'), {
              multiline: true,
              wide: true,
            })}
            {textField('contact_text', t('"Contact sales" text'), {
              multiline: true,
              wide: true,
            })}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
