import { type Control, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
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

import type { EnterpriseFormValues } from '../lib/enterprise-form'

type CreditConfigFieldsProps = {
  control: Control<EnterpriseFormValues>
  /** 编辑授信企业时传入本期已用（quota）：新额度不高于它时提示保存后立即停服 */
  periodUsedQuota?: number
}

/** 企业表单里的授信字段：额度立即作用于当前账期，周期类型从下一期生效 */
export function CreditConfigFields(props: CreditConfigFieldsProps) {
  const { t } = useTranslation()
  const cycleType = useWatch({
    control: props.control,
    name: 'credit.cycle_type',
  })
  const limitUsd = useWatch({
    control: props.control,
    name: 'credit.limit_usd',
  })
  const quotaPerUnit = getCurrencyDisplay().config.quotaPerUnit
  // 账期用量达到额度即拒绝请求，额度等于已用同样会立刻停服
  const exceedsUsage =
    props.periodUsedQuota !== undefined &&
    props.periodUsedQuota > 0 &&
    Math.round(limitUsd * quotaPerUnit) <= props.periodUsedQuota

  return (
    <>
      <ul className='text-muted-foreground list-disc space-y-1 pl-5 text-sm'>
        <li>{t('Limit changes apply to the current period immediately.')}</li>
        <li>{t('Cycle changes take effect from the next period.')}</li>
      </ul>
      <FormField
        control={props.control}
        name='credit.cycle_type'
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
              onValueChange={(value) => value !== null && field.onChange(value)}
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
            {cycleType === 'quota_based' && (
              <FormDescription>
                {t(
                  'The period has no end date: it is billed as soon as the limit is used up.'
                )}
              </FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
      {cycleType === 'quota_based' && (
        <FormField
          control={props.control}
          name='credit.auto_reset'
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
          control={props.control}
          name='credit.cycle_days'
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
                    field.onChange(Number.parseInt(event.target.value, 10) || 0)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <FormField
        control={props.control}
        name='credit.limit_usd'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Credit limit per period (USD)')}</FormLabel>
            <FormControl>
              <Input
                type='number'
                min={0}
                step='0.01'
                // 清空时记为 NaN 并显示空框，由表单校验提示必填，而不是悄悄按 0 提交
                value={Number.isNaN(field.value) ? '' : field.value}
                onBlur={field.onBlur}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === ''
                      ? Number.NaN
                      : Number.parseFloat(event.target.value)
                  )
                }
              />
            </FormControl>
            <FormDescription>
              {t(
                'Requests are rejected once the period usage reaches this limit. Raising it takes effect immediately.'
              )}
            </FormDescription>
            <FormMessage />
            {exceedsUsage && (
              <Alert variant='destructive'>
                <AlertDescription>
                  {t(
                    'Below the usage of the current period: the period goes over the limit and requests are rejected as soon as you save.'
                  )}
                </AlertDescription>
              </Alert>
            )}
          </FormItem>
        )}
      />
      <FormField
        control={props.control}
        name='credit.alert_percent'
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
    </>
  )
}
