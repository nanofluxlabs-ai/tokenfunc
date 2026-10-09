import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePricingData } from '@/features/pricing/hooks'
import type { PricingModel } from '@/features/pricing/types'
import { cn } from '@/lib/utils'

import { computeListPrices, isQuotableModel } from '../lib/quote-pricing'

type ModelPickerProps = {
  selected: Set<string>
  onToggle: (model: PricingModel, groupRatio: number, group: string) => void
  group: string
  onGroupChange: (group: string) => void
}

function money(value: number | null): string {
  return value === null ? '—' : value.toFixed(4).replace(/\.?0+$/, '')
}

/** 从系统定价里挑选要报价的模型；挂牌价按所选分组倍率计算 */
export function ModelPicker(props: ModelPickerProps) {
  const { t } = useTranslation()
  const { models, groupRatio, isLoading } = usePricingData()
  const [vendor, setVendor] = useState<string>('all')
  const [keyword, setKeyword] = useState('')

  const groups = useMemo(() => Object.keys(groupRatio).sort(), [groupRatio])
  const ratio = groupRatio[props.group] ?? 1
  const quotable = useMemo(() => models.filter(isQuotableModel), [models])
  const vendors = useMemo(
    () =>
      [
        ...new Set(
          quotable.map((model) => model.vendor_name || t('Unknown vendor'))
        ),
      ].sort(),
    [quotable, t]
  )
  const visible = useMemo(() => {
    const term = keyword.trim().toLowerCase()
    return quotable.filter((model) => {
      const vendorName = model.vendor_name || t('Unknown vendor')
      if (vendor !== 'all' && vendorName !== vendor) return false
      return term === '' || model.model_name.toLowerCase().includes(term)
    })
  }, [quotable, vendor, keyword, t])

  const columns: StaticDataTableColumn<PricingModel>[] = [
    {
      id: 'select',
      header: '',
      cell: (row) => (
        <Checkbox
          checked={props.selected.has(row.model_name)}
          onCheckedChange={() => props.onToggle(row, ratio, props.group)}
          aria-label={t('Select {{model}}', { model: row.model_name })}
        />
      ),
    },
    {
      id: 'model',
      header: t('Model'),
      cell: (row) => (
        <span className='font-mono text-sm'>{row.model_name}</span>
      ),
    },
    {
      id: 'vendor',
      header: t('Vendor'),
      cell: (row) => row.vendor_name || '—',
    },
    {
      id: 'input',
      header: t('Input'),
      cell: (row) => money(computeListPrices(row, ratio).input),
    },
    {
      id: 'output',
      header: t('Output'),
      cell: (row) => money(computeListPrices(row, ratio).output),
    },
    {
      id: 'cache',
      header: t('Cached input'),
      cell: (row) => money(computeListPrices(row, ratio).cache),
    },
  ]

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='max-w-xs'
          placeholder={t('Search models...')}
          aria-label={t('Search models')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <div className='w-44'>
          <Select
            items={groups.map((group) => ({
              value: group,
              label: `${group} ×${groupRatio[group]}`,
            }))}
            value={props.group}
            onValueChange={(value) =>
              value !== null && props.onGroupChange(value)
            }
          >
            <SelectTrigger aria-label={t('Price group')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {groups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group} ×{groupRatio[group]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='flex flex-wrap gap-1'>
        {['all', ...vendors].map((name) => (
          <Button
            key={name}
            type='button'
            size='sm'
            variant={vendor === name ? 'default' : 'outline'}
            className={cn('h-7')}
            onClick={() => setVendor(name)}
          >
            {name === 'all' ? t('All vendors') : name}
          </Button>
        ))}
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'List prices in USD per 1M tokens, taken from the current model pricing.'
        )}
      </p>
      <div className='max-h-[420px] overflow-y-auto'>
        <StaticDataTable
          columns={columns}
          data={visible}
          getRowKey={(row) => row.model_name}
          empty={!isLoading && visible.length === 0}
          emptyContent={t('No models match')}
        />
      </div>
    </div>
  )
}
