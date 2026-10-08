import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, UserCog } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/use-debounce'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listEnterpriseTokens } from '../api'
import { useAssignmentOptions } from '../hooks/use-assignment-options'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import type { EnterpriseToken } from '../types'
import { EnterpriseGuard } from './enterprise-guard'
import { EntitySelect } from './entity-select'
import { TokenAssignDialog } from './token-assign-dialog'
import { TokenCreateDialog } from './token-create-dialog'

const PAGE_SIZE = 20
// 筛选值：-1 不筛选，0 未分配，正数为具体 id
const ANY = -1

function KeysTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { employeeOptions, projectOptions } = useAssignmentOptions()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 400)
  const [employeeId, setEmployeeId] = useState(ANY)
  const [projectId, setProjectId] = useState(ANY)
  const [page, setPage] = useState(1)
  const [assigning, setAssigning] = useState<EnterpriseToken | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: [
      'enterprise',
      'tokens',
      debouncedKeyword,
      employeeId,
      projectId,
      page,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listEnterpriseTokens({
          keyword: debouncedKeyword || undefined,
          employee_id: employeeId === ANY ? undefined : employeeId,
          project_id: projectId === ANY ? undefined : projectId,
          p: page,
          page_size: PAGE_SIZE,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const columns: StaticDataTableColumn<EnterpriseToken>[] = [
    {
      id: 'name',
      header: t('Name'),
      cell: (row) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{row.name}</span>
          <span className='text-muted-foreground font-mono text-xs'>
            sk-{row.key}
          </span>
        </div>
      ),
    },
    {
      id: 'employee',
      header: t('Employee'),
      cell: (row) =>
        row.employee_id ? (
          <div className='flex flex-col'>
            <span>{row.employee_name}</span>
            {row.department_name && (
              <span className='text-muted-foreground text-xs'>
                {row.department_name}
              </span>
            )}
          </div>
        ) : (
          <span className='text-muted-foreground'>{t('Shared')}</span>
        ),
    },
    {
      id: 'project',
      header: t('Project'),
      cell: (row) => row.project_name || '—',
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => (
        <StatusBadge
          label={row.status === 1 ? t('Enabled') : t('Disabled')}
          variant={row.status === 1 ? 'success' : 'neutral'}
          copyable={false}
        />
      ),
    },
    {
      id: 'used',
      header: t('Used'),
      cell: (row) => formatQuotaWithCurrency(row.used_quota),
    },
    {
      id: 'remain',
      header: t('Remaining'),
      cell: (row) =>
        row.unlimited_quota
          ? t('Unlimited')
          : formatQuotaWithCurrency(row.remain_quota),
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (row) => (
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={t('Assign API Key')}
          onClick={() => setAssigning(row)}
        >
          <UserCog />
        </Button>
      ),
    },
  ]

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='max-w-xs'
          placeholder={t('Search key, employee or project...')}
          aria-label={t('Search API keys')}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            setPage(1)
          }}
        />
        <div className='w-48'>
          <EntitySelect
            aria-label={t('Filter by employee')}
            value={employeeId}
            onChange={(value) => {
              setEmployeeId(value)
              setPage(1)
            }}
            options={[
              { value: ANY, label: t('All Employees') },
              ...employeeOptions,
            ]}
            noneLabel={t('Shared (no employee)')}
          />
        </div>
        <div className='w-48'>
          <EntitySelect
            aria-label={t('Filter by project')}
            value={projectId}
            onChange={(value) => {
              setProjectId(value)
              setPage(1)
            }}
            options={[
              { value: ANY, label: t('All Projects') },
              ...projectOptions,
            ]}
            noneLabel={t('No project')}
          />
        </div>
        <div className='flex-1' />
        <Button variant='link' size='sm' render={<Link to='/keys' />}>
          {t('Advanced key settings')}
        </Button>
      </div>
      <StaticDataTable
        columns={columns}
        data={data?.items ?? []}
        getRowKey={(row) => row.id}
        empty={!isLoading && (data?.items.length ?? 0) === 0}
        emptyContent={t('No API keys yet')}
      />
      <div className='text-muted-foreground flex items-center justify-end gap-2 text-sm'>
        <span>{t('Total: {{count}}', { count: total })}</span>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          {t('Previous')}
        </Button>
        <span>
          {page} / {pageCount}
        </span>
        <Button
          variant='outline'
          size='sm'
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
        >
          {t('Next')}
        </Button>
      </div>
      <TokenAssignDialog
        token={assigning}
        onOpenChange={(open) => !open && setAssigning(null)}
        onSaved={() =>
          void queryClient.invalidateQueries({ queryKey: ['enterprise'] })
        }
      />
    </div>
  )
}

export function EnterpriseKeys() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: enterprise } = useEnterpriseSelf()
  const [creating, setCreating] = useState(false)
  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Employee API Keys')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          {enterprise && (
            <Button size='sm' onClick={() => setCreating(true)}>
              <Plus className='h-4 w-4' />
              {t('Create API Key')}
            </Button>
          )}
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <EnterpriseGuard>
            <KeysTable />
          </EnterpriseGuard>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <TokenCreateDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() =>
          void queryClient.invalidateQueries({ queryKey: ['enterprise'] })
        }
      />
    </>
  )
}
