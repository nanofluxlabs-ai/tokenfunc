import type { ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { ProviderBadge } from '@/components/provider-badge'
import { StatusBadge } from '@/components/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ChannelTypeLogo } from '@/features/channels/components/channel-type-badge'
import {
  getChannelStatusBadge,
  getChannelTypeLabel,
} from '@/features/channels/lib/channel-utils'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ChannelUsageItem } from '../types'
import { ChannelValueCell } from './channel-usage-cells'

const NUMERIC = 'text-right tabular-nums'

export function useChannelUsageColumns(params: {
  rangeColumnTitle: string
  isExpanded: (id: number) => boolean
  isExpandable: (channel: ChannelUsageItem) => boolean
}): ColumnDef<ChannelUsageItem, unknown>[] {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { rangeColumnTitle, isExpanded, isExpandable } = params
  return useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        enableSorting: false,
        cell: ({ row }) => {
          const expandable = isExpandable(row.original)
          const expanded = isExpanded(row.original.id)
          const Icon = expanded ? ChevronDown : ChevronRight
          return (
            <span className='flex items-center gap-1 font-mono text-sm'>
              <Icon
                aria-hidden='true'
                data-slot='expand-indicator'
                className={cn(
                  'text-muted-foreground size-4 shrink-0',
                  !expandable && 'invisible'
                )}
              />
              {row.original.id}
            </span>
          )
        },
        size: 90,
      },
      {
        accessorKey: 'name',
        header: t('Name'),
        enableSorting: false,
        cell: ({ row }) => {
          const channel = row.original
          const createdAt = channel.created_time
            ? formatTimestamp(channel.created_time)
            : '--'
          return (
            <Tooltip>
              <TooltipTrigger
                render={<span className='block truncate font-medium' />}
              >
                {channel.name}
              </TooltipTrigger>
              <TooltipContent className='max-w-xs'>
                <p className='text-xs opacity-80'>
                  {t('Created at')}: {createdAt}
                </p>
                {channel.remark.trim() !== '' && (
                  <p className='mt-1 text-sm'>{channel.remark}</p>
                )}
              </TooltipContent>
            </Tooltip>
          )
        },
        size: 200,
      },
      {
        accessorKey: 'type',
        header: t('Type'),
        enableSorting: false,
        cell: ({ row }) => (
          <ProviderBadge
            iconNode={<ChannelTypeLogo type={row.original.type} size={16} />}
            label={t(getChannelTypeLabel(row.original.type))}
            copyable={false}
            className='min-w-0'
          />
        ),
        size: 170,
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        enableSorting: false,
        cell: ({ row }) => {
          const badge = getChannelStatusBadge(row.original.status)
          return (
            <StatusBadge
              label={t(badge.label)}
              variant={badge.variant}
              size='sm'
              copyable={false}
            />
          )
        },
        size: 100,
      },
      {
        accessorKey: 'tag',
        header: t('Tag'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.tag ? (
            <StatusBadge
              label={row.original.tag}
              variant='cyan'
              size='sm'
              copyable={false}
            />
          ) : (
            <span className='text-muted-foreground'>-</span>
          ),
        size: 110,
      },
      {
        accessorKey: 'range_official_quota',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={rangeColumnTitle}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className={cn('flex justify-end', NUMERIC)}>
            <ChannelValueCell
              official={row.original.range_official_quota}
              actual={row.original.range_quota}
              prompt={row.original.range_prompt_tokens}
              completion={row.original.range_completion_tokens}
              callCount={row.original.range_call_count}
              locale={locale}
            />
          </div>
        ),
        size: 140,
      },
      {
        accessorKey: 'month_official_quota',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('This month value')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className={cn('flex justify-end', NUMERIC)}>
            <ChannelValueCell
              official={row.original.month_official_quota}
              actual={row.original.month_quota}
              prompt={row.original.month_prompt_tokens}
              completion={row.original.month_completion_tokens}
              callCount={row.original.month_call_count}
              locale={locale}
            />
          </div>
        ),
        size: 140,
      },
      {
        accessorKey: 'total_official_quota',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Total value')}
            className='justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className={cn('flex justify-end', NUMERIC)}>
            <ChannelValueCell
              official={row.original.total_official_quota}
              actual={row.original.total_quota}
              prompt={row.original.total_prompt_tokens}
              completion={row.original.total_completion_tokens}
              callCount={row.original.total_call_count}
              locale={locale}
            />
          </div>
        ),
        size: 140,
      },
    ],
    [t, locale, rangeColumnTitle, isExpanded, isExpandable]
  )
}
