import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { Switch } from '@/components/ui/switch'
import { getCurrencyDisplay } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'

import { configureEnterpriseCredit } from '../api'
import type { CreditCycleType, Enterprise } from '../types'

const CYCLE_TYPES: CreditCycleType[] = [
  'natural_month',
  'fixed_days',
  'quota_based',
]

function toCycleType(value: string): CreditCycleType {
  return CYCLE_TYPES.includes(value as CreditCycleType)
    ? (value as CreditCycleType)
    : 'natural_month'
}

type CreditConfigFormProps = {
  enterprise: Enterprise
  onSaved: () => void
  /** 与提交按钮并排的次要操作（如「切回预付」），避免在表单外另起一行 */
  secondaryAction?: ReactNode
}

/** 与后端 EnterpriseDefaultCreditAlertPercent 一致 */
const DEFAULT_ALERT_PERCENT = 80

/** 开通或修改授信：额度立即生效，周期类型从下一期生效 */
export function CreditConfigForm(props: CreditConfigFormProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const quotaPerUnit = getCurrencyDisplay().config.quotaPerUnit
  const schema = useMemo(
    () =>
      z
        .object({
          cycle_type: z.enum(CYCLE_TYPES),
          cycle_days: z.number().int().min(1).max(366),
          limit_usd: z.number().min(0, t('Credit limit cannot be negative')),
          alert_percent: z
            .number()
            .int()
            .min(0, t('Alert threshold must be between 0 and 99'))
            .max(99, t('Alert threshold must be between 0 and 99')),
          auto_reset: z.boolean(),
        })
        // 额度为 0 的额度信用会在首次请求就"用满"翻转，后端同样拒绝
        .refine(
          (values) =>
            values.cycle_type !== 'quota_based' || values.limit_usd > 0,
          {
            path: ['limit_usd'],
            message: t('Quota based credit requires a positive limit'),
          }
        ),
    [t]
  )
  type Values = z.infer<typeof schema>
  const isCredit = props.enterprise.billing_mode === 'credit'
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      cycle_type: 'natural_month',
      cycle_days: 30,
      limit_usd: 0,
      alert_percent: DEFAULT_ALERT_PERCENT,
      auto_reset: false,
    },
  })
  const cycleType = useWatch({ control: form.control, name: 'cycle_type' })

  useEffect(() => {
    form.reset({
      cycle_type: toCycleType(props.enterprise.credit_cycle_type),
      cycle_days: props.enterprise.credit_cycle_days || 30,
      limit_usd: props.enterprise.credit_limit_quota / quotaPerUnit,
      // 尚未开通授信的企业沿用默认阈值；已开通的保留当前值（含 0 = 关闭）
      alert_percent: isCredit
        ? props.enterprise.credit_alert_percent
        : DEFAULT_ALERT_PERCENT,
      auto_reset: props.enterprise.credit_auto_reset,
    })
  }, [props.enterprise, form, quotaPerUnit, isCredit])

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const result = await configureEnterpriseCredit(
        props.enterprise.id,
        values
      )
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(isCredit ? t('Credit updated') : t('Credit enabled'))
      props.onSaved()
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  let submitLabel = isCredit ? t('Update credit') : t('Enable credit')
  if (isSubmitting) submitLabel = t('Saving...')

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-4'
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      >
        <FormField
          control={form.control}
          name='cycle_type'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Billing Cycle')}</FormLabel>
              <Select
                items={[
                  { value: 'natural_month', label: t('Calendar month') },
                  { value: 'fixed_days', label: t('Fixed number of days') },
                  { value: 'quota_based', label: t('By quota') },
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
                    <SelectItem value='natural_month'>
                      {t('Calendar month')}
                    </SelectItem>
                    <SelectItem value='fixed_days'>
                      {t('Fixed number of days')}
                    </SelectItem>
                    <SelectItem value='quota_based'>{t('By quota')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormDescription>
                {cycleType === 'quota_based'
                  ? t(
                      'The period has no end date: it is billed as soon as the limit is used up.'
                    )
                  : isCredit &&
                    t('Cycle changes take effect from the next period.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {cycleType === 'quota_based' && (
          <FormField
            control={form.control}
            name='auto_reset'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between gap-4'>
                <div>
                  <FormLabel>{t('Open next period automatically')}</FormLabel>
                  <FormDescription>
                    {t(
                      'On: a new period starts as soon as the limit is used up. Off: requests are rejected until the bill is paid or a period is opened manually.'
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        )}
        {cycleType === 'fixed_days' && (
          <FormField
            control={form.control}
            name='cycle_days'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Cycle length (days)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={1}
                    max={366}
                    value={field.value}
                    onChange={(event) =>
                      field.onChange(
                        Number.parseInt(event.target.value, 10) || 0
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name='limit_usd'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Credit limit per period (USD)')}</FormLabel>
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
                  'Requests are rejected once the period usage reaches this limit. Raising it takes effect immediately.'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='alert_percent'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Usage alert threshold (%)')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  min={0}
                  max={99}
                  step={1}
                  value={field.value}
                  onChange={(event) =>
                    field.onChange(Number.parseInt(event.target.value, 10) || 0)
                  }
                />
              </FormControl>
              <FormDescription>
                {t(
                  'The billing email and administrators are notified when period usage reaches this percentage, and again when the limit is exhausted. 0 disables alerts.'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className='flex items-center justify-end gap-2'>
          {props.secondaryAction}
          <Button type='submit' disabled={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
