// TokenFunc 二开：某个用户分组的渠道分组定价表，纯展示组件。
// 定价抽屉（用户管理 › 用户分组）与系统设置 › 分组定价 的面板共用；
// 「只看有差异」与搜索是表内状态，调用方换分组时用 key 重挂载即可清掉。
import { Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { translateServerText } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  differsFromBase,
  isRatioInvalid,
  parseRatioText,
  type PricingRowView,
} from '../lib/user-group-pricing'

type UserGroupPricingTableProps = {
  rows: PricingRowView[]
  /** 任一格改动后回传整张表的新行 */
  onChange: (rows: PricingRowView[]) => void
  disabled?: boolean
}

/** 表格渲染用的行：叠加翻译后的名称与派生标记 */
type PricingRowCell = PricingRowView & {
  label: string
  ratioInvalid: boolean
}

export function UserGroupPricingTable(props: UserGroupPricingTableProps) {
  const { t } = useTranslation()
  const [onlyDifferences, setOnlyDifferences] = useState(false)
  const [search, setSearch] = useState('')
  const disabled = props.disabled ?? false

  const cells = useMemo<PricingRowCell[]>(
    () =>
      props.rows.map((row) => ({
        ...row,
        label: translateServerText(t, row.label) || row.channel_group,
        ratioInvalid: isRatioInvalid(row),
      })),
    [props.rows, t]
  )

  const visibleCells = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return cells.filter((row) => {
      if (onlyDifferences && !differsFromBase(row)) return false
      if (keyword === '') return true
      return (
        row.channel_group.toLowerCase().includes(keyword) ||
        row.label.toLowerCase().includes(keyword)
      )
    })
  }, [cells, onlyDifferences, search])

  const updateRow = (
    target: PricingRowView,
    patch: Partial<Pick<PricingRowView, 'visible' | 'ratioText'>>
  ) => {
    props.onChange(
      props.rows.map((row) =>
        row.channel_group === target.channel_group ? { ...row, ...patch } : row
      )
    )
  }

  const columns: StaticDataTableColumn<PricingRowCell>[] = [
    {
      id: 'channel_group',
      header: t('Channel group'),
      className: 'min-w-40',
      cell: (row) => (
        <span className='flex min-w-0 items-center gap-1.5'>
          <span className='truncate font-medium' title={row.channel_group}>
            {row.label}
          </span>
          {row.locked && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className='text-muted-foreground inline-flex shrink-0'
                    aria-label={t('Always visible to its own user group')}
                  />
                }
              >
                <Lock className='size-3.5' aria-hidden='true' />
              </TooltipTrigger>
              <TooltipContent>
                {t('Always visible to its own user group')}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      id: 'base',
      header: t('Base'),
      className: 'w-28',
      cell: (row) => (
        <span className='flex flex-col gap-0.5'>
          <span className='font-mono tabular-nums'>{row.base_ratio}x</span>
          <span className='text-muted-foreground text-xs'>
            {row.default_visible
              ? t('Visible by default')
              : t('Hidden by default')}
          </span>
        </span>
      ),
    },
    {
      id: 'visible',
      header: t('Visible'),
      className: 'w-20',
      cell: (row) => (
        <Switch
          checked={row.visible}
          disabled={row.locked || disabled}
          aria-label={t('Visible for {{group}}', { group: row.label })}
          onCheckedChange={(checked) =>
            // 取消可见后倍率没有意义：一起清空，提交时 ratio 为 null
            updateRow(
              row,
              checked ? { visible: true } : { visible: false, ratioText: '' }
            )
          }
        />
      ),
    },
    {
      id: 'ratio',
      header: t('Ratio'),
      className: 'w-32',
      cell: (row) => (
        <Input
          type='number'
          min={0}
          step={0.01}
          inputMode='decimal'
          value={row.ratioText}
          placeholder={String(row.base_ratio)}
          disabled={!row.visible || disabled}
          aria-invalid={row.ratioInvalid || undefined}
          aria-label={t('Ratio override for {{group}}', { group: row.label })}
          className='font-mono tabular-nums'
          onChange={(event) =>
            updateRow(row, { ratioText: event.target.value })
          }
        />
      ),
    },
    {
      id: 'effective',
      header: t('Effective'),
      className: 'w-24 text-right',
      cellClassName: 'text-right',
      cell: (row) => {
        if (!row.visible) {
          return <span className='text-muted-foreground'>—</span>
        }
        const override = parseRatioText(row.ratioText)
        return (
          <span
            className={cn(
              'font-mono tabular-nums',
              override === null && 'text-muted-foreground'
            )}
          >
            {override ?? row.base_ratio}x
          </span>
        )
      },
    },
  ]

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        <Label className='flex items-center gap-2 text-sm'>
          <Checkbox
            checked={onlyDifferences}
            onCheckedChange={(checked) => setOnlyDifferences(checked === true)}
          />
          {t('Only show differences')}
        </Label>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Search channel groups')}
          aria-label={t('Search channel groups')}
          className='sm:ml-auto sm:max-w-60'
        />
      </div>
      <div className='overflow-x-auto'>
        <StaticDataTable
          columns={columns}
          data={visibleCells}
          getRowKey={(row) => row.channel_group}
          tableClassName='min-w-[560px]'
          emptyContent={
            props.rows.length === 0
              ? t('No channel groups')
              : t('No matching channel groups')
          }
        />
      </div>
    </div>
  )
}
