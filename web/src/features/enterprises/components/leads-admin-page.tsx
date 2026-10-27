import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { ColumnDef, PaginationState } from '@tanstack/react-table'
import { Inbox } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listTrialLeads, updateTrialLead } from '../api'
import type { TrialLead } from '../types'

const DEFAULT_PAGE_SIZE = 20

const STATUS_LABEL: Record<TrialLead['status'], string> = {
  new: 'New',
  contacted: 'Contacted',
  closed: 'Closed',
}

const VOLUME_LABEL: Record<TrialLead['volume'], string> = {
  '': '—',
  lt_1k: '< $1,000 / month',
  '1k_10k': '$1,000–10,000 / month',
  gt_10k: '> $10,000 / month',
}

function LeadFollowUpDialog(props: {
  lead: TrialLead | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<TrialLead['status']>('contacted')
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadedFor, setLoadedFor] = useState<number | null>(null)

  if (props.lead && loadedFor !== props.lead.id) {
    setLoadedFor(props.lead.id)
    setStatus(props.lead.status)
    setRemark(props.lead.remark)
  }

  const save = async () => {
    if (!props.lead) return
    setSaving(true)
    try {
      const result = await updateTrialLead(props.lead.id, { status, remark })
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Follow-up saved'))
      props.onSaved()
      props.onOpenChange(false)
    } catch (error) {
      handleServerError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={props.lead !== null}
      onOpenChange={props.onOpenChange}
      title={props.lead?.company ?? ''}
      description={props.lead?.contact}
      contentClassName='max-w-md'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => props.onOpenChange(false)}
            disabled={saving}
          >
            {t('Cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className='grid gap-2'>
        <Label htmlFor='lead-status'>{t('Status')}</Label>
        <Select
          items={(Object.keys(STATUS_LABEL) as TrialLead['status'][]).map(
            (value) => ({
              value,
              label: t(STATUS_LABEL[value]),
            })
          )}
          value={status}
          onValueChange={(value) => setStatus(value as TrialLead['status'])}
        >
          <SelectTrigger id='lead-status'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {(Object.keys(STATUS_LABEL) as TrialLead['status'][]).map(
                (value) => (
                  <SelectItem key={value} value={value}>
                    {t(STATUS_LABEL[value])}
                  </SelectItem>
                )
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className='grid gap-2'>
        <Label htmlFor='lead-remark'>{t('Remark')}</Label>
        <Textarea
          id='lead-remark'
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          placeholder={t('Follow-up notes')}
          rows={4}
        />
      </div>
    </Dialog>
  )
}

function LeadsAdminContent() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | TrialLead['status']>('new')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  })
  const [editing, setEditing] = useState<TrialLead | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'admin-enterprise',
      'leads',
      filter,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listTrialLeads({
          status: filter === 'all' ? undefined : filter,
          p: pagination.pageIndex + 1,
          page_size: pagination.pageSize,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })

  const columns: ColumnDef<TrialLead>[] = [
    {
      id: 'company',
      header: t('Company'),
      meta: { mobileTitle: true },
      cell: ({ row: { original: row } }) => row.company,
    },
    {
      id: 'contact',
      header: t('Contact'),
      meta: { mobileOrder: 10 },
      cell: ({ row: { original: row } }) => (
        <span className='font-mono'>{row.contact}</span>
      ),
    },
    {
      id: 'volume',
      header: t('Estimated monthly usage'),
      meta: { mobileOrder: 20 },
      cell: ({ row: { original: row } }) => VOLUME_LABEL[row.volume] ?? '—',
    },
    {
      id: 'status',
      header: t('Status'),
      meta: { mobileBadge: true },
      cell: ({ row: { original: row } }) => (
        <Badge variant={row.status === 'new' ? 'default' : 'outline'}>
          {t(STATUS_LABEL[row.status])}
        </Badge>
      ),
    },
    {
      id: 'remark',
      header: t('Remark'),
      meta: { mobileHidden: true },
      cell: ({ row: { original: row } }) => row.remark || '—',
    },
    {
      id: 'created',
      header: t('Created'),
      meta: { mobileHidden: true },
      cell: ({ row: { original: row } }) =>
        formatTimestampToDate(row.created_at),
    },
    {
      id: 'actions',
      header: t('Actions'),
      enableHiding: false,
      cell: ({ row: { original: row } }) => (
        <Button variant='outline' size='sm' onClick={() => setEditing(row)}>
          {t('Follow up')}
        </Button>
      ),
    },
  ]

  const { table } = useDataTable({
    data: data?.items ?? [],
    columns,
    pagination,
    onPaginationChange: setPagination,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total ?? 0,
    enableRowSelection: false,
  })

  return (
    <div className='flex flex-col gap-4'>
      <Tabs
        value={filter}
        onValueChange={(value) => {
          setFilter(value as typeof filter)
          setPagination((prev) => ({ ...prev, pageIndex: 0 }))
        }}
      >
        <TabsList>
          <TabsTrigger value='new'>{t('New')}</TabsTrigger>
          <TabsTrigger value='contacted'>{t('Contacted')}</TabsTrigger>
          <TabsTrigger value='closed'>{t('Closed')}</TabsTrigger>
          <TabsTrigger value='all'>{t('All')}</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyTitle={t('No trial requests yet')}
        emptyIcon={<Inbox />}
        skeletonKeyPrefix='lead-skeleton'
        paginationInFooter={false}
      />
      <LeadFollowUpDialog
        lead={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSaved={() =>
          void queryClient.invalidateQueries({
            queryKey: ['admin-enterprise', 'leads'],
          })
        }
      />
    </div>
  )
}

/** 管理员：营销页提交的企业试用申请 */
export function EnterpriseLeadsAdmin() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Trial Requests')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <LeadsAdminContent />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
