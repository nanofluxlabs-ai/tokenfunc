import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS } from '../../constants'
import type { OrdersFilterValue } from '../../lib/orders-filter'

type OrdersFilterBarProps = {
  value: OrdersFilterValue
  onApply: (value: OrdersFilterValue) => void
  onReset: () => void
}

type SelectOption = { value: string; label: string }

function FilterSelect(props: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
}) {
  return (
    <Select
      items={props.options}
      value={props.value}
      onValueChange={(value) => value !== null && props.onChange(String(value))}
    >
      <SelectTrigger aria-label={props.ariaLabel} className='w-full'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** 订单中心筛选：输入不即时请求，点「筛选订单」才生效（与 tokensolo 一致） */
export function OrdersFilterBar(props: OrdersFilterBarProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<OrdersFilterValue>(props.value)
  useEffect(() => {
    setDraft(props.value)
  }, [props.value])

  const withAll = (
    entries: Record<string, { labelKey: string }>,
    allLabel: string
  ): SelectOption[] => [
    { value: 'all', label: allLabel },
    ...Object.entries(entries).map(([value, config]) => ({
      value,
      label: t(config.labelKey),
    })),
  ]
  const update = (patch: Partial<OrdersFilterValue>) =>
    setDraft((previous) => ({ ...previous, ...patch }))
  const submit = () => props.onApply(draft)

  return (
    <div className='flex flex-col gap-2'>
      <div className='grid gap-2 md:grid-cols-5'>
        <div className='relative'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2' />
          <Input
            value={draft.keyword}
            onChange={(event) => update({ keyword: event.target.value })}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
            placeholder={t('Order No. / Subject')}
            aria-label={t('Order No. / Subject')}
            className='pl-8'
          />
        </div>
        <div className='relative'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2' />
          <Input
            value={draft.username}
            onChange={(event) => update({ username: event.target.value })}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
            placeholder={t('Username')}
            aria-label={t('Username')}
            className='pl-8'
          />
        </div>
        <FilterSelect
          value={draft.orderType}
          options={withAll(ORDER_TYPES, t('All order types'))}
          onChange={(orderType) => update({ orderType })}
          ariaLabel={t('Order type')}
        />
        <FilterSelect
          value={draft.status}
          options={[
            { value: 'all', label: t('All statuses') },
            ...Object.keys(ORDER_STATUSES).map((value) => ({
              value,
              label: value,
            })),
          ]}
          onChange={(status) => update({ status })}
          ariaLabel={t('Status')}
        />
        <FilterSelect
          value={draft.payMethod}
          options={withAll(PAYMENT_METHODS, t('All payment methods'))}
          onChange={(payMethod) => update({ payMethod })}
          ariaLabel={t('Payment method')}
        />
      </div>
      <div className='flex justify-end gap-2'>
        <Button size='sm' onClick={submit}>
          {t('Filter orders')}
        </Button>
        <Button size='sm' variant='outline' onClick={props.onReset}>
          {t('Reset order filters')}
        </Button>
      </div>
    </div>
  )
}
