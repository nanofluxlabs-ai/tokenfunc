import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import {
  BILLING_DATE_PRESETS,
  type BillingDatePresetId,
} from '../lib/billing-day'

const PRESET_LABEL_KEYS: Record<BillingDatePresetId, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  month: 'Current month',
}

/** 快捷区间按钮组；区间按计费时区计算（与财务中心的 DatePresetButtons 同一口径） */
export function BillingDatePresets(props: {
  onSelect: (preset: BillingDatePresetId) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      {BILLING_DATE_PRESETS.map((preset) => (
        <Button
          key={preset}
          variant='outline'
          size='sm'
          disabled={props.disabled}
          onClick={() => props.onSelect(preset)}
        >
          {t(PRESET_LABEL_KEYS[preset])}
        </Button>
      ))}
    </>
  )
}
