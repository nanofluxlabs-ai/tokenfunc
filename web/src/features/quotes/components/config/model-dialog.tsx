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

import type { QuoteModel, QuoteSubgroup } from '../../types'
import { OptionSelect } from './option-select'

type ModelDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  isEdit: boolean
  /** 编辑时的原值，或复制时的预填值 */
  preset?: QuoteModel
  groupOptions: { value: string; label: string }[]
  defaultGroupKey: string
  saving: boolean
  onSubmit: (model: QuoteModel) => Promise<boolean>
}

export function ModelDialog(props: ModelDialogProps) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('Required')),
        id: z.string().trim().min(1, t('Required')),
        group_key: z.string().min(1, t('Required')),
        subgroup: z.enum(['standard', 'codex']),
        context_window: z.string(),
        max_output: z.string(),
        input_price: z.number().min(0),
        output_price: z.number().min(0),
        cache_read: z.number().min(0),
        cache_write_5m: z.number().min(0),
        cache_write_1h: z.number().min(0),
        note: z.string(),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>

  const defaults = useMemo<Values>(
    () => ({
      name: '',
      id: '',
      group_key: props.defaultGroupKey,
      subgroup: 'standard',
      context_window: '',
      max_output: '',
      input_price: 0,
      output_price: 0,
      cache_read: 0,
      cache_write_5m: 0,
      cache_write_1h: 0,
      note: '',
    }),
    [props.defaultGroupKey]
  )

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })

  useEffect(() => {
    if (!props.open) return
    form.reset(props.preset ? { ...defaults, ...props.preset } : defaults)
  }, [props.open, props.preset, defaults, form])

  const subgroupOptions: { value: QuoteSubgroup; label: string }[] = [
    { value: 'standard', label: t('Standard') },
    { value: 'codex', label: t('Code (Codex)') },
  ]

  const onSubmit = async (values: Values) => {
    const ok = await props.onSubmit(values)
    if (ok) props.onOpenChange(false)
  }

  const textField = (
    name: 'name' | 'id' | 'context_window' | 'max_output' | 'note',
    label: string,
    placeholder?: string
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} placeholder={placeholder} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  const priceField = (
    name:
      | 'input_price'
      | 'output_price'
      | 'cache_read'
      | 'cache_write_5m'
      | 'cache_write_1h',
    label: string,
    step: number
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
              min={0}
              step={step}
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
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.isEdit ? t('Edit model') : t('Add model')}
      contentClassName='sm:max-w-2xl'
      footer={
        <Button type='submit' form='quote-model-form' disabled={props.saving}>
          {props.saving ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='quote-model-form'
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          {textField('name', t('Display name'), 'Claude Opus 5')}
          {textField('id', t('Model ID'), 'claude-opus-5')}
          <FormField
            control={form.control}
            name='group_key'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Group')}</FormLabel>
                <OptionSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={props.groupOptions}
                  aria-label={t('Group')}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='subgroup'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Subgroup')}</FormLabel>
                <OptionSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={subgroupOptions}
                  aria-label={t('Subgroup')}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          {textField('context_window', t('Context window'), '1M / 200K')}
          {textField('max_output', t('Max output'), '128K / 64K')}
          {priceField('input_price', t('Input price (USD / 1M tokens)'), 0.01)}
          {priceField(
            'output_price',
            t('Output price (USD / 1M tokens)'),
            0.01
          )}
          {priceField(
            'cache_read',
            t('Cache read (USD / 1M tokens, 0 = n/a)'),
            0.001
          )}
          {priceField(
            'cache_write_5m',
            t('5-minute cache write (USD / 1M tokens, 0 = n/a)'),
            0.01
          )}
          {priceField(
            'cache_write_1h',
            t('1-hour cache write (USD / 1M tokens, 0 = n/a)'),
            0.01
          )}
          {textField('note', t('Note (reserved, not shown in the quote)'))}
        </form>
      </Form>
    </Dialog>
  )
}
