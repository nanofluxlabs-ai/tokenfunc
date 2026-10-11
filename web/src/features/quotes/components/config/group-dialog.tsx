import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import type { QuoteFooterNote, QuoteGroup, QuoteRenderType } from '../../types'
import { OptionSelect } from './option-select'

const GROUP_KEY_PATTERN = /^[a-z][a-z0-9_-]*$/

type GroupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 编辑的分组；为空表示新建 */
  group?: QuoteGroup
  nextOrder: number
  saving: boolean
  onSubmit: (group: QuoteGroup) => Promise<boolean>
}

export function GroupDialog(props: GroupDialogProps) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        key: z
          .string()
          .trim()
          .min(1, t('Required'))
          .regex(
            GROUP_KEY_PATTERN,
            t('Lowercase letter first, then lowercase letters, digits, _ or -')
          ),
        short_name: z.string().trim().min(1, t('Required')),
        name: z.string().trim().min(1, t('Required')),
        order: z.number().int().min(1),
        default_discount: z.number().min(1).max(100),
        render_type: z.enum(['cache_table', 'simple_table']),
        intro: z.string().trim().min(1, t('Required')),
        model_table_title: z.string(),
        tail_header: z.string(),
        tail_cell: z.string(),
        appendix_title: z.string().trim().min(1, t('Required')),
        footer_note: z.enum([
          '',
          'official_notes',
          'proxy_comparison',
          'gpt_notes',
        ]),
        show_unit_line: z.boolean(),
        show_stability_warning: z.boolean(),
        show_image_pricing: z.boolean(),
        thinking_alias: z.boolean(),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>

  const defaults = useMemo<Values>(
    () => ({
      key: '',
      short_name: '',
      name: '',
      order: props.nextOrder,
      default_discount: 50,
      render_type: 'simple_table',
      intro: '',
      model_table_title: t('Standard models'),
      tail_header: 'TPM / RPM',
      tail_cell: t('Shared platform steady state'),
      appendix_title: '',
      footer_note: '',
      show_unit_line: true,
      show_stability_warning: false,
      show_image_pricing: false,
      thinking_alias: false,
    }),
    [props.nextOrder, t]
  )

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })

  useEffect(() => {
    if (!props.open) return
    form.reset(props.group ? { ...props.group } : defaults)
  }, [props.open, props.group, defaults, form])

  const renderTypeOptions: { value: QuoteRenderType; label: string }[] = [
    {
      value: 'cache_table',
      label: t('Claude style (with 5m/1h cache columns)'),
    },
    { value: 'simple_table', label: t('Simple (input / cache read / output)') },
  ]
  const footerNoteOptions: { value: QuoteFooterNote; label: string }[] = [
    { value: '', label: t('None') },
    { value: 'official_notes', label: t('Claude official notes') },
    { value: 'proxy_comparison', label: t('Proxy vs official comparison') },
    { value: 'gpt_notes', label: t('GPT series notes') },
  ]

  const onSubmit = async (values: Values) => {
    // 编辑时 key 不可改，以原始值为准
    const ok = await props.onSubmit({
      ...values,
      key: props.group ? props.group.key : values.key,
    })
    if (ok) props.onOpenChange(false)
  }

  const textField = (
    name:
      | 'key'
      | 'short_name'
      | 'name'
      | 'model_table_title'
      | 'tail_header'
      | 'tail_cell'
      | 'appendix_title',
    label: string,
    placeholder?: string,
    disabled?: boolean
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} placeholder={placeholder} disabled={disabled} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  const numberField = (
    name: 'order' | 'default_discount',
    label: string,
    attrs: { min: number; max?: number; step: number }
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

  const switchField = (
    name:
      | 'show_unit_line'
      | 'show_stability_warning'
      | 'show_image_pricing'
      | 'thinking_alias',
    label: string
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className='flex flex-row items-center justify-between gap-3 rounded-lg border p-3'>
          <FormLabel className='font-normal'>{label}</FormLabel>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </FormItem>
      )}
    />
  )

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.group ? t('Edit group') : t('Add group')}
      contentClassName='sm:max-w-2xl'
      footer={
        <Button type='submit' form='quote-group-form' disabled={props.saving}>
          {props.saving ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='quote-group-form'
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          {textField(
            'key',
            t('Group key (immutable after save)'),
            'gemini',
            props.group !== undefined
          )}
          {textField(
            'short_name',
            t('Short name (discount input label)'),
            'Gemini'
          )}
          <div className='sm:col-span-2'>
            {textField('name', t('Section title'), t('Gemini model list'))}
          </div>
          {numberField('order', t('Order (ascending)'), { min: 1, step: 1 })}
          {numberField('default_discount', t('Default discount (%)'), {
            min: 1,
            max: 100,
            step: 1,
          })}
          <FormField
            control={form.control}
            name='render_type'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Table style')}</FormLabel>
                <OptionSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={renderTypeOptions}
                  aria-label={t('Table style')}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='footer_note'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Footer note block')}</FormLabel>
                <OptionSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={footerNoteOptions}
                  aria-label={t('Footer note block')}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='intro'
            render={({ field }) => (
              <FormItem className='sm:col-span-2'>
                <FormLabel>
                  {t('Intro (first line under the section title)')}
                </FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {textField('model_table_title', t('Model table title'))}
          {textField(
            'appendix_title',
            t('Appendix A title'),
            t('Gemini model IDs')
          )}
          {textField('tail_header', t('Last column header'))}
          {textField('tail_cell', t('Last column cell'))}
          {switchField(
            'show_unit_line',
            t('Show "unit / exchange rate" line in intro')
          )}
          {switchField(
            'show_stability_warning',
            t('Append third-party proxy stability warning')
          )}
          {switchField(
            'show_image_pricing',
            t('Render image pricing table at the end')
          )}
          {switchField(
            'thinking_alias',
            t('Enable -thinking alias (summary row + appendix)')
          )}
        </form>
      </Form>
    </Dialog>
  )
}
