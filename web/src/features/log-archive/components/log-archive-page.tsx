import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { ColumnDef, PaginationState } from '@tanstack/react-table'
import { Archive, RotateCcw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { MetricCard } from '@/features/finance/components/metric-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  getLogArchiveStatus,
  listLogArchiveManifests,
  retryLogArchiveDay,
} from '../api'
import {
  LOG_ARCHIVE_PAGE_SIZE,
  LOG_ARCHIVE_QUERY_KEY,
  LOG_ARCHIVE_STATUS_TAGS,
} from '../constants'
import { formatBytes } from '../lib/format'
import type { LogArchiveManifest } from '../types'

const EMPTY_CELL = '—'

/** 归档清单（Root）：保留任务状态 + 按天清单 + 单日重试 */
/** 右对齐的数字列 */
const NUMERIC_COLUMN_IDS = new Set(['rows', 'bytes', 'purged'])

export function LogArchivePage() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: LOG_ARCHIVE_PAGE_SIZE,
  })
  const [retrying, setRetrying] = useState<LogArchiveManifest | null>(null)

  const status = useQuery({
    queryKey: [LOG_ARCHIVE_QUERY_KEY, 'status'],
    queryFn: async () =>
      requireServerSuccess(await getLogArchiveStatus()).data ?? null,
  })
  const manifests = useQuery({
    queryKey: [
      LOG_ARCHIVE_QUERY_KEY,
      'manifests',
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listLogArchiveManifests({
          p: pagination.pageIndex + 1,
          page_size: pagination.pageSize,
        })
      ).data ?? null,
    placeholderData: keepPreviousData,
  })
  const retry = useMutation({
    mutationFn: async (day: string) =>
      requireServerSuccess(await retryLogArchiveDay(day)).data,
    onSuccess: (manifest) => {
      toast.success(
        t('Archive for {{day}} is now {{status}}', {
          day: manifest?.day ?? '',
          status: manifest
            ? t(LOG_ARCHIVE_STATUS_TAGS[manifest.status].labelKey)
            : '',
        })
      )
      setRetrying(null)
      void queryClient.invalidateQueries({ queryKey: [LOG_ARCHIVE_QUERY_KEY] })
    },
    onError: (error) => handleServerError(error, t('Failed to retry archive')),
  })

  const retention = status.data?.status
  const summary = status.data?.summary
  const items = manifests.data?.items ?? []

  let retentionValue = EMPTY_CELL
  if (retention) {
    retentionValue = retention.enabled
      ? t('{{count}} days', { count: retention.effective_days })
      : t('Disabled')
  }
  let storeValue = EMPTY_CELL
  if (retention) {
    storeValue = retention.store_configured
      ? [retention.bucket, retention.prefix].filter(Boolean).join('/')
      : t('Not configured')
  }
  let lastRunHint: ReactNode
  if (retention?.last_error) {
    lastRunHint = (
      <span className='text-destructive'>{retention.last_error}</span>
    )
  } else if (retention?.last_result?.stopped_reason) {
    lastRunHint = t(
      '{{days}} days purged, {{rows}} rows deleted ({{reason}})',
      {
        days: retention.last_result.days_purged,
        rows: retention.last_result.rows_deleted,
        reason: retention.last_result.stopped_reason,
      }
    )
  }

  const columns: ColumnDef<LogArchiveManifest>[] = [
    {
      id: 'day',
      header: t('Date'),
      cell: ({ row: { original: row } }) => (
        <span className='font-mono'>{row.day}</span>
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: ({ row: { original: row } }) => (
        <StatusBadge
          label={t(LOG_ARCHIVE_STATUS_TAGS[row.status].labelKey)}
          variant={LOG_ARCHIVE_STATUS_TAGS[row.status].variant}
          size='sm'
          copyable={false}
        />
      ),
    },
    {
      id: 'rows',
      header: t('Rows'),
      cell: ({ row: { original: row } }) =>
        row.parts > 1
          ? `${formatCompactNumber(row.total_rows, locale)} (${row.parts})`
          : formatCompactNumber(row.row_count, locale),
    },
    {
      id: 'object',
      header: t('Object'),
      cell: ({ row: { original: row } }) =>
        row.object_key ? (
          <div className='flex min-w-0 items-center gap-1'>
            <span className='truncate font-mono text-xs'>{row.object_key}</span>
            <CopyButton
              value={row.object_key}
              size='icon'
              className='size-6'
              iconClassName='size-3.5'
              aria-label={`${t('Copy')} ${row.object_key}`}
            />
          </div>
        ) : (
          EMPTY_CELL
        ),
    },
    {
      id: 'bytes',
      header: t('Size'),
      cell: ({ row: { original: row } }) =>
        row.bytes ? formatBytes(row.bytes) : EMPTY_CELL,
    },
    {
      id: 'purged',
      header: t('Deleted rows'),
      cell: ({ row: { original: row } }) =>
        formatCompactNumber(row.purged_rows, locale),
    },
    {
      id: 'error',
      header: t('Last error'),
      cell: ({ row: { original: row } }) =>
        row.last_error ? (
          <span className='text-destructive line-clamp-2 text-xs'>
            {row.last_error}
          </span>
        ) : (
          EMPTY_CELL
        ),
    },
    {
      id: 'updated',
      header: t('Updated at'),
      cell: ({ row: { original: row } }) => (
        <span className='text-muted-foreground text-xs'>
          {formatTimestampToDate(row.updated_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableHiding: false,
      cell: ({ row: { original: row } }) =>
        row.status === 'purged' ? null : (
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Retry archive')}
            onClick={() => setRetrying(row)}
          >
            <RotateCcw />
          </Button>
        ),
    },
  ]

  const { table } = useDataTable({
    data: items,
    columns,
    pagination,
    onPaginationChange: setPagination,
    manualPagination: true,
    manualFiltering: true,
    totalCount: manifests.data?.total ?? 0,
    enableRowSelection: false,
  })

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Log Archive')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='flex flex-col gap-4'>
            <p className='text-muted-foreground -mt-1 text-sm'>
              {t(
                'Each day of consume and error logs older than the retention window is exported to object storage, verified, then deleted. Top-ups, admin adjustments and refunds are never deleted, and no day is deleted before it has been rolled up.'
              )}
            </p>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <MetricCard
                label={t('Retention')}
                value={retentionValue}
                hint={
                  retention
                    ? t('Runs daily at {{time}}', { time: retention.run_at })
                    : undefined
                }
                loading={status.isLoading}
              />
              <MetricCard
                label={t('Object storage')}
                value={<span className='truncate text-base'>{storeValue}</span>}
                loading={status.isLoading}
              />
              <MetricCard
                label={t('Purge cutoff')}
                value={retention?.cutoff_day || EMPTY_CELL}
                hint={
                  retention
                    ? t('Rollup cursor {{day}}', {
                        day: retention.rollup_cursor || EMPTY_CELL,
                      })
                    : undefined
                }
                loading={status.isLoading}
              />
              <MetricCard
                label={t('Last run')}
                value={
                  retention?.last_run_at
                    ? formatTimestampToDate(retention.last_run_at)
                    : EMPTY_CELL
                }
                hint={lastRunHint}
                loading={status.isLoading}
              />
            </div>
            {summary &&
              (summary.row_mismatch_days > 0 || summary.pending_days > 0) && (
                <Alert variant='destructive'>
                  <AlertDescription>
                    {summary.pending_days > 0 &&
                      t(
                        '{{count}} days are pending (export or upload failed); retry them below.',
                        { count: summary.pending_days }
                      )}
                    {summary.pending_days > 0 && summary.row_mismatch_days > 0
                      ? ' '
                      : ''}
                    {summary.row_mismatch_days > 0 &&
                      t(
                        '{{count}} purged days have a row count mismatch between archive and deletion.',
                        { count: summary.row_mismatch_days }
                      )}
                  </AlertDescription>
                </Alert>
              )}
            {summary && (
              <p className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                <span>
                  {t('Purged days')}: {summary.purged_days}
                </span>
                <span>
                  {t('Uploaded, awaiting purge')}: {summary.verified_days}
                </span>
                <span>
                  {t('Pending')}: {summary.pending_days}
                </span>
                <span>
                  {t('Deleted rows')}:{' '}
                  {formatCompactNumber(summary.purged_rows, locale)}
                </span>
                {summary.max_purged_day && (
                  <span>
                    {t('Latest purged day')}: {summary.max_purged_day}
                  </span>
                )}
              </p>
            )}
            <DataTablePage
              table={table}
              columns={columns}
              isLoading={manifests.isLoading}
              isFetching={manifests.isFetching}
              emptyTitle={t('No archived days yet')}
              emptyDescription={t(
                'Days appear here after the first retention run.'
              )}
              emptyIcon={<Archive />}
              skeletonKeyPrefix='log-archive-skeleton'
              paginationInFooter={false}
              getColumnClassName={(columnId, kind) => {
                if (!NUMERIC_COLUMN_IDS.has(columnId)) return undefined
                return kind === 'header'
                  ? 'text-right'
                  : 'text-right tabular-nums'
              }}
            />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <ConfirmDialog
        open={retrying !== null}
        onOpenChange={(open) => !open && setRetrying(null)}
        title={t('Retry archive')}
        desc={t(
          'Re-run archive, verification and purge for {{day}}? Rows are only deleted after the upload is verified.',
          { day: retrying?.day ?? '' }
        )}
        confirmText={t('Retry')}
        isLoading={retry.isPending}
        handleConfirm={() => retrying && retry.mutate(retrying.day)}
      />
    </>
  )
}
