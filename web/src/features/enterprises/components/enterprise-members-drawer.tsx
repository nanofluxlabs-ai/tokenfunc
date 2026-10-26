import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef, PaginationState } from '@tanstack/react-table'
import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import {
  sideDrawerContentClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { StatusBadge } from '@/components/status-badge'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { FilterSelect } from '@/features/enterprise-console/components/members-section'
import { MEMBER_ROLE_LABELS } from '@/features/enterprise-console/lib/member-roles'
import type { Member } from '@/features/enterprise-console/types'
import { useDebounce } from '@/hooks/use-debounce'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listEnterpriseMembers } from '../api'
import type { EnterpriseListItem } from '../types'

const ANY = 'all'
const DEFAULT_PAGE_SIZE = 10

type EnterpriseMembersDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: EnterpriseListItem
}

/** 管理员：只读查看某企业的员工名单。员工由企业自治，这里不提供任何编辑 / 删除操作 */
export function EnterpriseMembersDrawer(props: EnterpriseMembersDrawerProps) {
  const { t } = useTranslation()
  const enterpriseId = props.currentRow?.id ?? 0
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 400)
  const [login, setLogin] = useState<string>(ANY)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  })

  // 换企业或重新打开时清掉上一家的筛选
  useEffect(() => {
    if (!props.open) return
    setKeyword('')
    setLogin(ANY)
    setPagination({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE })
  }, [props.open, enterpriseId])

  // 筛选变化回到第 1 页
  useEffect(() => {
    setPagination((previous) =>
      previous.pageIndex === 0 ? previous : { ...previous, pageIndex: 0 }
    )
  }, [debouncedKeyword, login])

  const hasLogin = login === ANY ? undefined : login === 'true'
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'admin-enterprise-members',
      enterpriseId,
      debouncedKeyword,
      hasLogin,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listEnterpriseMembers(enterpriseId, {
          keyword: debouncedKeyword || undefined,
          has_login: hasLogin,
          p: pagination.pageIndex + 1,
          page_size: pagination.pageSize,
        })
      ).data ?? { items: [], total: 0 },
    enabled: props.open && enterpriseId > 0,
    placeholderData: keepPreviousData,
  })

  const columns: ColumnDef<Member>[] = [
    {
      id: 'name',
      header: t('Name'),
      cell: ({ row: { original: row } }) => (
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
      cell: ({ row: { original: row } }) => row.employee_no || '—',
    },
    {
      id: 'team',
      header: t('Team'),
      cell: ({ row: { original: row } }) => row.team_name || '—',
    },
    {
      id: 'login',
      header: t('Console access'),
      cell: ({ row: { original: row } }) =>
        row.user_id > 0 ? (
          <div className='flex flex-col'>
            <span className='font-mono text-sm'>{row.username}</span>
            <span className='text-muted-foreground text-xs'>
              {t(MEMBER_ROLE_LABELS[row.role])}
            </span>
          </div>
        ) : (
          <span className='text-muted-foreground'>{t('Key only')}</span>
        ),
    },
    {
      id: 'token_count',
      header: t('API Keys'),
      cell: ({ row: { original: row } }) => (
        <span className='font-mono text-sm'>{row.token_count}</span>
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: ({ row: { original: row } }) => (
        <StatusBadge
          label={row.status === 'active' ? t('Active') : t('Disabled')}
          variant={row.status === 'active' ? 'success' : 'neutral'}
          copyable={false}
        />
      ),
    },
  ]

  const { table } = useDataTable({
    data: data?.items ?? [],
    columns,
    getRowId: (row) => String(row.id),
    pagination,
    onPaginationChange: setPagination,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total ?? 0,
    enableRowSelection: false,
  })

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[860px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle className='flex items-center gap-2'>
            <Users className='size-4' aria-hidden='true' />
            {t('Members')} · {props.currentRow?.name}
          </SheetTitle>
          <SheetDescription>
            {t(
              '{{members}} members, {{logins}} can sign in. Members are managed by the enterprise itself; this list is read-only.',
              {
                members: props.currentRow?.member_count ?? 0,
                logins: props.currentRow?.login_count ?? 0,
              }
            )}
          </SheetDescription>
        </SheetHeader>
        <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              className='max-w-xs'
              placeholder={t('Search name, email or employee No....')}
              aria-label={t('Search members')}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <div className='w-40'>
              <FilterSelect
                label={t('Filter by console access')}
                value={login}
                options={[
                  { value: ANY, label: t('All members') },
                  { value: 'true', label: t('Can sign in') },
                  { value: 'false', label: t('Key only') },
                ]}
                onChange={setLogin}
              />
            </div>
          </div>
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={isLoading}
            isFetching={isFetching}
            emptyTitle={t('No members yet')}
            emptyDescription={t(
              'This enterprise has not added any members in its console.'
            )}
            emptyIcon={<Users />}
            skeletonKeyPrefix='admin-enterprise-member-skeleton'
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
