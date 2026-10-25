import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { PromoterEditableFields } from '../types'

type PromoterFieldsProps = {
  value: PromoterEditableFields
  onChange: (next: PromoterEditableFields) => void
}

/** 添加 / 编辑推广人共用：备注 + 分成比例（百分比，只做标识，不参与计算） */
export function PromoterFields(props: PromoterFieldsProps) {
  const { t } = useTranslation()
  return (
    <>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='promoter-remark'>{t('Remark')}</Label>
        <Input
          id='promoter-remark'
          value={props.value.remark}
          maxLength={255}
          onChange={(event) =>
            props.onChange({ ...props.value, remark: event.target.value })
          }
          placeholder={t('Optional, e.g. channel or contact')}
        />
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='promoter-share-rate'>{t('Share rate (%)')}</Label>
        <Input
          id='promoter-share-rate'
          type='number'
          inputMode='decimal'
          min={0}
          max={100}
          step={0.01}
          value={props.value.share_rate === 0 ? '' : props.value.share_rate}
          onChange={(event) =>
            props.onChange({
              ...props.value,
              share_rate: Number.parseFloat(event.target.value) || 0,
            })
          }
          placeholder='0'
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'Informational only. Payouts are calculated offline on net profit; the system never computes the amount.'
          )}
        </p>
      </div>
    </>
  )
}
