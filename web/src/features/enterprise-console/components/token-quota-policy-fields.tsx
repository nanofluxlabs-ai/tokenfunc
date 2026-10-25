import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { toIntlLocale } from '@/i18n/languages'
import { getCurrencyLabel } from '@/lib/currency'

import {
  formatResetTime,
  previewNextResetAt,
  TOKEN_QUOTA_RESET_PERIODS,
  type TokenQuotaPolicyDraft,
} from '../lib/token-quota-policy'

export type TokenQuotaPolicyFieldsProps = {
  value: TokenQuotaPolicyDraft
  onChange: (draft: TokenQuotaPolicyDraft) => void
  /** 子字段的校验错误（由各自表单的 zod 结果映射） */
  errors?: Partial<Record<'period_quota_dollars' | 'custom_hours', string>>
  /** 是否提供「不设周期限额」选项（策略对话框用，抽屉里由额度模式三选一承担） */
  allowNever?: boolean
  /** 控件 id 前缀，保证同页多实例时 label 关联唯一 */
  idPrefix: string
}

/**
 * 周期限额的共用字段：周期（每日 / 每周 / 每月 / 自定义小时数）+ 周期额度 + 下次重置预览。
 * 受控组件，被抽屉额度段与策略对话框复用。
 */
export function TokenQuotaPolicyFields(props: TokenQuotaPolicyFieldsProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const draft = props.value
  const nextResetAt = previewNextResetAt(draft, Date.now())
  const periodId = `${props.idPrefix}-period`
  const hoursId = `${props.idPrefix}-hours`
  const amountId = `${props.idPrefix}-amount`
  const isNever = draft.reset_period === 'never'

  return (
    <div className='flex flex-col gap-3'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor={periodId}>{t('Reset period')}</Label>
          <NativeSelect className='w-full'>
            <select
              id={periodId}
              value={draft.reset_period}
              onChange={(event) =>
                props.onChange({
                  ...draft,
                  reset_period: event.target
                    .value as TokenQuotaPolicyDraft['reset_period'],
                })
              }
            >
              {props.allowNever && (
                <NativeSelectOption value='never'>
                  {t('No periodic quota')}
                </NativeSelectOption>
              )}
              {TOKEN_QUOTA_RESET_PERIODS.map((period) => (
                <NativeSelectOption key={period.value} value={period.value}>
                  {t(period.labelKey)}
                </NativeSelectOption>
              ))}
            </select>
          </NativeSelect>
        </div>
        {draft.reset_period === 'custom' && (
          <div className='flex flex-col gap-2'>
            <Label htmlFor={hoursId}>{t('Custom period (hours)')}</Label>
            <Input
              id={hoursId}
              type='number'
              min={1}
              step='1'
              value={draft.custom_hours}
              aria-invalid={Boolean(props.errors?.custom_hours)}
              onChange={(event) =>
                props.onChange({
                  ...draft,
                  custom_hours: Number.parseInt(event.target.value, 10) || 0,
                })
              }
            />
            {props.errors?.custom_hours && (
              <p className='text-destructive text-sm'>
                {props.errors.custom_hours}
              </p>
            )}
          </div>
        )}
      </div>
      {!isNever && (
        <div className='flex flex-col gap-2'>
          <Label htmlFor={amountId}>
            {t('Period quota ({{currency}})', {
              currency: getCurrencyLabel(),
            })}
          </Label>
          <Input
            id={amountId}
            type='number'
            min={0}
            step='0.01'
            value={draft.period_quota_dollars}
            aria-invalid={Boolean(props.errors?.period_quota_dollars)}
            onChange={(event) =>
              props.onChange({
                ...draft,
                period_quota_dollars:
                  Number.parseFloat(event.target.value) || 0,
              })
            }
          />
          {props.errors?.period_quota_dollars && (
            <p className='text-destructive text-sm'>
              {props.errors.period_quota_dollars}
            </p>
          )}
          <p className='text-muted-foreground text-xs'>
            {nextResetAt === null
              ? t(
                  'The remaining quota is set to the period amount immediately and restored at every reset.'
                )
              : t('Next reset: {{time}}', {
                  time: formatResetTime(nextResetAt, locale),
                })}
          </p>
        </div>
      )}
    </div>
  )
}
