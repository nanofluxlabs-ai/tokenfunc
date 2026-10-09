import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { applyDiscount } from '../lib/quote-pricing'
import type { QuoteItemInput } from '../types'

type QuoteItemsTableProps = {
  items: QuoteItemInput[]
  globalDiscount: number
  onChange: (modelName: string, patch: Partial<QuoteItemInput>) => void
  onRemove: (modelName: string) => void
}

function money(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '')
}

/** 已选模型及折后价预览；行折扣为 0 时使用全局折扣 */
export function QuoteItemsTable(props: QuoteItemsTableProps) {
  const { t } = useTranslation()
  const effective = (item: QuoteItemInput) =>
    item.discount_percent > 0 ? item.discount_percent : props.globalDiscount
  const columns: StaticDataTableColumn<QuoteItemInput>[] = [
    {
      id: 'model',
      header: t('Model'),
      cell: (row) => (
        <div className='flex flex-col'>
          <span className='font-mono text-sm'>{row.model_name}</span>
          <span className='text-muted-foreground text-xs'>
            {row.vendor_name}
          </span>
        </div>
      ),
    },
    {
      id: 'list',
      header: t('List price (in / out)'),
      cell: (row) => (
        <span className='text-muted-foreground font-mono text-xs'>
          {money(row.input_usd)} / {money(row.output_usd)}
        </span>
      ),
    },
    {
      id: 'discount',
      header: t('Discount %'),
      cell: (row) => (
        <Input
          type='number'
          min={0}
          max={100}
          step='0.5'
          className='h-8 w-24'
          aria-label={t('Discount for {{model}}', { model: row.model_name })}
          placeholder={String(props.globalDiscount)}
          value={row.discount_percent === 0 ? '' : row.discount_percent}
          onChange={(event) =>
            props.onChange(row.model_name, {
              discount_percent: Number.parseFloat(event.target.value) || 0,
            })
          }
        />
      ),
    },
    {
      id: 'quoted',
      header: t('Quoted (in / out / cached)'),
      cell: (row) => (
        <span className='font-mono text-sm'>
          {money(applyDiscount(row.input_usd, effective(row)))} /{' '}
          {money(applyDiscount(row.output_usd, effective(row)))} /{' '}
          {row.cache_usd > 0
            ? money(applyDiscount(row.cache_usd, effective(row)))
            : '—'}
        </span>
      ),
    },
    {
      id: 'note',
      header: t('Note'),
      cell: (row) => (
        <Input
          className='h-8'
          aria-label={t('Note for {{model}}', { model: row.model_name })}
          value={row.note}
          onChange={(event) =>
            props.onChange(row.model_name, { note: event.target.value })
          }
        />
      ),
    },
    {
      id: 'remove',
      header: '',
      cell: (row) => (
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={t('Remove')}
          onClick={() => props.onRemove(row.model_name)}
        >
          <Trash2 />
        </Button>
      ),
    },
  ]
  return (
    <StaticDataTable
      columns={columns}
      data={props.items}
      getRowKey={(row) => row.model_name}
      empty={props.items.length === 0}
      emptyContent={t('Pick models from the list to add them to the quote')}
    />
  )
}
