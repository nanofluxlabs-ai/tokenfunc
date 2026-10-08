import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/use-debounce'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { deleteEmployee, listEmployees } from '../api'
import type { DepartmentNode, Employee } from '../types'
import type { DepartmentSelection } from './department-panel'
import { EmployeeDialog } from './employee-dialog'

const PAGE_SIZE = 20

export function EmployeesSection(props: {
  tree: DepartmentNode[]
  department: DepartmentSelection
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 400)
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<{ employee?: Employee } | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)

  const departmentId = props.department === 'all' ? undefined : props.department
  const { data, isLoading } = useQuery({
    queryKey: ['enterprise', 'employees', departmentId, debouncedKeyword, page],
    queryFn: async () =>
      requireServerSuccess(
        await listEmployees({
          department_id: departmentId,
          keyword: debouncedKeyword || undefined,
          p: page,
          page_size: PAGE_SIZE,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ['enterprise', 'employees'],
    })
    void queryClient.invalidateQueries({ queryKey: ['enterprise', 'tokens'] })
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const result = await deleteEmployee(deleting.id)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Employee deleted'))
      setDeleting(null)
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  const columns: StaticDataTableColumn<Employee>[] = [
    {
      id: 'name',
      header: t('Name'),
      cell: (row) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{row.name}</span>
          {row.email && (
            <span className='text-muted-foreground text-xs'>{row.email}</span>
          )}
        </div>
      ),
    },
    {
      id: 'employee_no',
      header: t('Employee No.'),
      cell: (row) => row.employee_no || '—',
    },
    {
      id: 'department',
      header: t('Department'),
      cell: (row) => row.department_name || t('Unassigned'),
    },
    {
      id: 'token_count',
      header: t('API Keys'),
      cell: (row) => row.token_count,
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => (
        <StatusBadge
          label={row.status === 'active' ? t('Active') : t('Disabled')}
          variant={row.status === 'active' ? 'success' : 'neutral'}
          copyable={false}
        />
      ),
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (row) => (
        <div className='flex gap-1'>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Edit')}
            onClick={() => setDialog({ employee: row })}
          >
            <Pencil />
          </Button>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Delete')}
            onClick={() => setDeleting(row)}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className='flex min-w-0 flex-col gap-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='max-w-xs'
          placeholder={t('Search name, email or employee No....')}
          aria-label={t('Search employees')}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            setPage(1)
          }}
        />
        <div className='flex-1' />
        <Button size='sm' onClick={() => setDialog({})}>
          <Plus className='h-4 w-4' />
          {t('Add Employee')}
        </Button>
      </div>
      <StaticDataTable
        columns={columns}
        data={data?.items ?? []}
        getRowKey={(row) => row.id}
        empty={!isLoading && (data?.items.length ?? 0) === 0}
        emptyContent={t('No employees yet')}
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

      <EmployeeDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        tree={props.tree}
        employee={dialog?.employee}
        defaultDepartmentId={
          typeof props.department === 'number' ? props.department : 0
        }
        onSaved={refresh}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('Delete Employee')}
        desc={t(
          'The employee will be removed and all of their API keys disabled. Usage history is kept.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => void handleDelete()}
      />
    </div>
  )
}
