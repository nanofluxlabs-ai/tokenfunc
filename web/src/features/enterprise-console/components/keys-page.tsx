import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import {
  Copy,
  Edit,
  Loader2,
  Plus,
  Power,
  PowerOff,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import {
  DataTableRowActionMenu,
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { API_KEY_STATUS, API_KEY_STATUSES } from '@/features/keys/constants'
import { useDebounce } from '@/hooks/use-debounce'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { encodeChannelConnectionInfo } from '@/lib/channel-connection-info'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampRelative } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  batchDeleteEnterpriseTokens,
  batchUpdateEnterpriseTokenStatus,
  deleteEnterpriseToken,
  fetchEnterpriseTokenKey,
  getEnterpriseTokenOptions,
  listEnterpriseTokens,
  updateEnterpriseTokenStatus,
} from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { useTeamOptions, useTeams } from '../hooks/use-team-options'
import { isTeamScoped } from '../lib/member-roles'
import { isTeamBudgetBlocked } from '../lib/team-budget'
import type { EnterpriseKeysSearch } from '../search-schema'
import type { EnterpriseToken } from '../types'
import { EnterpriseGuard } from './enterprise-guard'
import { EnterpriseRoleBadge } from './enterprise-role-badge'
import { EntitySelect } from './entity-select'
import { MEMBER_PICKER_ANY, MemberPicker } from './member-picker'
import { TokenMutateSheet } from './token-mutate-sheet'
import { TokenQuotaCell } from './token-quota-cell'
import { TokenQuotaPolicyDialog } from './token-quota-policy-dialog'

const PAGE_SIZE = 20
// 筛选值：-1 不筛选，0 未指定持有人，正数为具体 id
const ANY = MEMBER_PICKER_ANY
const STATUS_ANY = '0'
/** 总数达到上限的九成时提示 */
const LIMIT_WARN_RATIO = 0.9

const route = getRouteApi('/_authenticated/enterprise/keys')

/** 本月消耗 + 环比（上月为 0 时不显示环比） */
function MonthQuotaCell(props: { row: EnterpriseToken }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const current = props.row.month_quota
  const previous = props.row.prev_month_quota
  let delta: string | null = null
  if (previous > 0) {
    const percent = ((current - previous) / previous) * 100
    delta = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      signDisplay: 'always',
    }).format(percent)
  }
  return (
    <div className='flex flex-col'>
      <span className='font-mono'>{formatQuotaWithCurrency(current)}</span>
      {delta !== null && (
        <span
          className={cn(
            'text-xs',
            current > previous ? 'text-rose-500' : 'text-emerald-600'
          )}
          title={t('Compared with last month')}
        >
          {delta}%
        </span>
      )}
    </div>
  )
}

/** 限制列：分组 · N 个模型 · N 个 IP */
function RestrictionsCell(props: { row: EnterpriseToken }) {
  const { t } = useTranslation()
  const models = props.row.model_limits
    ? props.row.model_limits.split(',').filter(Boolean).length
    : 0
  const ips = props.row.allow_ips
    ? props.row.allow_ips.split('\n').filter((line) => line.trim()).length
    : 0
  const parts = [
    props.row.group || t('Follow enterprise group'),
    models > 0 ? t('{{count}} models', { count: models }) : t('All models'),
    ips > 0 ? t('{{count}} IPs', { count: ips }) : null,
  ].filter(Boolean)
  return (
    <span className='text-muted-foreground text-xs'>{parts.join(' · ')}</span>
  )
}

type KeysTableProps = {
  onEdit: (token: EnterpriseToken) => void
  /** 行菜单单把 / 批量条多把：打开「设置周期限额」对话框 */
  onQuotaPolicy: (tokenIds: number[], current?: EnterpriseToken) => void
  /** 父组件完成批量操作后递增，用来清掉已选 */
  selectionVersion: number
}

function KeysTable(props: KeysTableProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const { data: enterprise } = useEnterpriseSelf()
  const { status: siteStatus } = useStatus()
  const teamOptions = useTeamOptions()
  const teams = useTeams()
  // 已超预算且勾了拦截的团队：其 key 行在状态列标「预算拦截中」
  const blockedTeamIds = useMemo(
    () =>
      new Set(
        (teams.data ?? []).filter(isTeamBudgetBlocked).map((team) => team.id)
      ),
    [teams.data]
  )
  const teamScoped = isTeamScoped(enterprise?.actor)
  const [keyword, setKeyword] = useState(search.q ?? '')
  const debouncedKeyword = useDebounce(keyword, 400)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [toggling, setToggling] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<EnterpriseToken | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const teamId = search.team_id ?? ANY
  const memberId = search.member_id ?? ANY
  const page = search.page ?? 1
  const now = Date.now()

  const update = (patch: Partial<EnterpriseKeysSearch>) =>
    void navigate({
      search: (prev: EnterpriseKeysSearch) => ({ ...prev, page: 1, ...patch }),
      replace: true,
    })

  // 关键字防抖后再写入 URL，避免每个字符都产生一次导航
  useEffect(() => {
    const next = debouncedKeyword || undefined
    if (next === search.q) return
    void navigate({
      search: (prev: EnterpriseKeysSearch) => ({ ...prev, page: 1, q: next }),
      replace: true,
    })
  }, [debouncedKeyword, search.q, navigate])

  const { data, isLoading } = useQuery({
    queryKey: [
      'enterprise',
      'tokens',
      search.q,
      teamId,
      memberId,
      search.status,
      search.expiring,
      page,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await listEnterpriseTokens({
          keyword: search.q || undefined,
          team_id: teamId === ANY ? undefined : teamId,
          member_id: memberId === ANY ? undefined : memberId,
          status: search.status,
          expiring: search.expiring || undefined,
          p: page,
          page_size: PAGE_SIZE,
        })
      ).data ?? { items: [], total: 0 },
    placeholderData: keepPreviousData,
  })
  const items = useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const options = useQuery({
    queryKey: ['enterprise', 'token-options'],
    queryFn: async () =>
      requireServerSuccess(await getEnterpriseTokenOptions()).data ?? null,
    staleTime: 30 * 1000,
  })
  const limit = options.data?.limit ?? 0
  const nearLimit =
    limit > 0 && (options.data?.total ?? 0) >= limit * LIMIT_WARN_RATIO

  // 翻页 / 筛选 / 父组件批量操作完成后清掉已选
  useEffect(() => {
    setSelected(new Set())
  }, [
    search.q,
    teamId,
    memberId,
    search.status,
    search.expiring,
    page,
    props.selectionVersion,
  ])

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['enterprise'] })

  const resolveRealKey = async (id: number) => {
    const result = await fetchEnterpriseTokenKey(id)
    if (!result.success || !result.data) {
      handleServerError(result)
      return null
    }
    return `sk-${result.data.key}`
  }

  const handleToggle = async (row: EnterpriseToken) => {
    const enable = row.status !== API_KEY_STATUS.ENABLED
    setToggling(row.id)
    try {
      const result = await updateEnterpriseTokenStatus(
        row.id,
        enable ? API_KEY_STATUS.ENABLED : API_KEY_STATUS.DISABLED
      )
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(enable ? t('API Key enabled') : t('API Key disabled'))
      refresh()
    } catch (error) {
      handleServerError(error)
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const result = await deleteEnterpriseToken(deleting.id)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('API Key deleted'))
      setDeleting(null)
      refresh()
    } catch (error) {
      handleServerError(error)
    }
  }

  const handleBulkStatus = async (status: number) => {
    setBulkBusy(true)
    try {
      const result = await batchUpdateEnterpriseTokenStatus(
        [...selected],
        status
      )
      if (!result.success || !result.data) {
        handleServerError(result)
        return
      }
      toast.success(
        t('Updated {{count}} keys', { count: result.data.updated }) +
          (result.data.skipped.length > 0
            ? ` · ${t('{{count}} skipped (expired or exhausted)', { count: result.data.skipped.length })}`
            : '')
      )
      setSelected(new Set())
      refresh()
    } catch (error) {
      handleServerError(error)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkDelete = async () => {
    setBulkBusy(true)
    try {
      const result = await batchDeleteEnterpriseTokens([...selected])
      if (!result.success || !result.data) {
        handleServerError(result)
        return
      }
      toast.success(t('Deleted {{count}} keys', { count: result.data.deleted }))
      setBulkDeleting(false)
      setSelected(new Set())
      refresh()
    } catch (error) {
      handleServerError(error)
    } finally {
      setBulkBusy(false)
    }
  }

  const allSelected =
    items.length > 0 && items.every((row) => selected.has(row.id))
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((row) => row.id)))
  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const statusOptions = [
    { value: STATUS_ANY, label: t('All statuses') },
    ...Object.values(API_KEY_STATUSES).map((config) => ({
      value: String(config.value),
      label: t(config.label),
    })),
  ]

  const columns: StaticDataTableColumn<EnterpriseToken>[] = [
    {
      id: 'select',
      header: (
        <Checkbox
          aria-label={t('Select all')}
          checked={allSelected}
          onCheckedChange={toggleAll}
        />
      ),
      className: 'w-8',
      cell: (row) => (
        <Checkbox
          aria-label={t('Select {{name}}', { name: row.name })}
          checked={selected.has(row.id)}
          onCheckedChange={() => toggleOne(row.id)}
        />
      ),
    },
    {
      id: 'name',
      header: t('Name'),
      cell: (row) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{row.name}</span>
          <span className='text-muted-foreground flex items-center gap-1 font-mono text-xs'>
            sk-{row.key}
            <CopyButton
              size='icon-sm'
              className='size-5'
              iconClassName='size-3'
              resolveValue={() => resolveRealKey(row.id)}
              tooltip={t('Copy key')}
              aria-label={t('Copy key {{name}}', { name: row.name })}
            />
          </span>
        </div>
      ),
    },
    {
      id: 'owner',
      header: t('Team · Holder'),
      cell: (row) => (
        <div className='flex flex-col'>
          <span>
            {row.team_name || '—'}
            {row.team_status === 'archived' && (
              <span className='text-muted-foreground ml-1 text-xs'>
                ({t('Archived')})
              </span>
            )}
          </span>
          <span className='text-muted-foreground text-xs'>
            {row.member_id ? row.member_name : t('Team key')}
          </span>
        </div>
      ),
    },
    {
      id: 'quota',
      header: t('Quota'),
      cell: (row) => <TokenQuotaCell row={row} now={now} />,
    },
    {
      id: 'month',
      header: t('Spend this month'),
      cell: (row) => <MonthQuotaCell row={row} />,
    },
    {
      id: 'restrictions',
      header: t('Restrictions'),
      cell: (row) => <RestrictionsCell row={row} />,
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (row) => {
        // 行上状态用后端派生的四态，与状态筛选、概览待办同口径
        const config = API_KEY_STATUSES[row.effective_status]
        return (
          <div className='flex flex-wrap gap-1'>
            <StatusBadge
              label={config ? t(config.label) : String(row.effective_status)}
              variant={config?.variant ?? 'neutral'}
              copyable={false}
            />
            {blockedTeamIds.has(row.team_id) && (
              <StatusBadge
                label={t('Blocked by budget')}
                variant='danger'
                copyable={false}
              />
            )}
          </div>
        )
      },
    },
    {
      id: 'accessed',
      header: t('Last used'),
      cell: (row) =>
        row.accessed_time > 0 && row.accessed_time !== row.created_time
          ? formatTimestampRelative(row.accessed_time, 'seconds', locale)
          : '—',
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (row) => {
        const enabled = row.status === API_KEY_STATUS.ENABLED
        let statusIcon = <Power className='size-4' />
        if (toggling === row.id) {
          statusIcon = <Loader2 className='size-4 animate-spin' />
        } else if (enabled) {
          statusIcon = <PowerOff className='size-4' />
        }
        return (
          <div className='-ml-1.5 flex items-center gap-1'>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={enabled ? t('Disable') : t('Enable')}
              disabled={toggling === row.id}
              className={
                enabled
                  ? 'text-destructive hover:text-destructive'
                  : 'text-emerald-600 hover:text-emerald-600'
              }
              onClick={() => void handleToggle(row)}
            >
              {statusIcon}
            </Button>
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('Edit')}
              onClick={() => props.onEdit(row)}
            >
              <Edit className='size-4' />
            </Button>
            <DataTableRowActionMenu ariaLabel={t('Open menu')} modal={false}>
              <DropdownMenuItem
                onClick={async () => {
                  const key = await resolveRealKey(row.id)
                  if (key && (await copyToClipboard(key))) {
                    toast.success(t('Copied'))
                  }
                }}
              >
                <Copy className='size-4' /> {t('Copy key')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const key = await resolveRealKey(row.id)
                  const baseUrl =
                    (siteStatus?.server_address as string | undefined) ||
                    window.location.origin
                  if (
                    key &&
                    (await copyToClipboard(
                      encodeChannelConnectionInfo(key, baseUrl)
                    ))
                  ) {
                    toast.success(t('Copied'))
                  }
                }}
              >
                <Copy className='size-4' /> {t('Copy connection info')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => props.onQuotaPolicy([row.id], row)}
              >
                <RotateCcw className='size-4' /> {t('Set periodic quota')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setDeleting(row)}
              >
                <Trash2 className='size-4' /> {t('Delete')}
              </DropdownMenuItem>
            </DataTableRowActionMenu>
          </div>
        )
      },
    },
  ]

  return (
    <div className='flex flex-col gap-3'>
      {nearLimit && (
        <Alert>
          <AlertDescription>
            {t(
              '{{total}} of {{limit}} API keys used. Contact your account manager to raise the limit.',
              {
                total: options.data?.total ?? 0,
                limit,
              }
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='max-w-xs'
          placeholder={t('Search key name or holder...')}
          aria-label={t('Search API keys')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        {!teamScoped && (
          <div className='w-44'>
            <EntitySelect
              aria-label={t('Filter by team')}
              value={teamId}
              onChange={(value) =>
                update({
                  team_id: value === ANY ? undefined : value,
                  member_id: undefined,
                })
              }
              options={[{ value: ANY, label: t('All Teams') }, ...teamOptions]}
              noneLabel={t('Default team')}
            />
          </div>
        )}
        <div className='w-52'>
          <MemberPicker
            aria-label={t('Filter by holder')}
            value={memberId}
            onChange={(value) =>
              update({ member_id: value === ANY ? undefined : value })
            }
            teamId={teamId > 0 ? teamId : undefined}
            allowAny
            noneLabel={t('Team key (no holder)')}
          />
        </div>
        <div className='w-36'>
          <Select
            items={statusOptions}
            value={search.status ? String(search.status) : STATUS_ANY}
            onValueChange={(value) =>
              update({
                status:
                  value && value !== STATUS_ANY ? Number(value) : undefined,
              })
            }
          >
            <SelectTrigger
              aria-label={t('Filter by status')}
              className='w-full'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant={search.expiring ? 'default' : 'outline'}
          size='sm'
          aria-pressed={Boolean(search.expiring)}
          onClick={() =>
            update({ expiring: search.expiring ? undefined : true })
          }
        >
          {t('Expiring soon')}
        </Button>
        <div className='flex-1' />
        {selected.size > 0 && (
          <div className='flex items-center gap-1'>
            <span className='text-muted-foreground text-sm'>
              {t('{{count}} selected', { count: selected.size })}
            </span>
            <Button
              variant='outline'
              size='sm'
              aria-label={t('Enable selected')}
              disabled={bulkBusy}
              onClick={() => void handleBulkStatus(API_KEY_STATUS.ENABLED)}
            >
              {t('Enable')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              aria-label={t('Disable selected')}
              disabled={bulkBusy}
              onClick={() => void handleBulkStatus(API_KEY_STATUS.DISABLED)}
            >
              {t('Disable')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              aria-label={t('Set periodic quota for selected')}
              disabled={bulkBusy}
              onClick={() => props.onQuotaPolicy([...selected])}
            >
              {t('Periodic quota')}
            </Button>
            <Button
              variant='destructive'
              size='sm'
              aria-label={t('Delete selected')}
              disabled={bulkBusy}
              onClick={() => setBulkDeleting(true)}
            >
              {t('Delete')}
            </Button>
          </div>
        )}
      </div>
      <StaticDataTable
        columns={columns}
        data={items}
        getRowKey={(row) => row.id}
        empty={!isLoading && items.length === 0}
        emptyContent={t('No API keys yet')}
      />
      <div className='text-muted-foreground flex items-center justify-end gap-2 text-sm'>
        <span>{t('Total: {{count}}', { count: total })}</span>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => update({ page: page - 1 })}
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
          onClick={() => update({ page: page + 1 })}
        >
          {t('Next')}
        </Button>
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('Delete API Key')}
        desc={t(
          'The key stops working immediately. Its usage history stays in reports and bills.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => void handleDelete()}
      />
      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title={t('Delete {{count}} API keys', { count: selected.size })}
        desc={t(
          'The keys stop working immediately. Their usage history stays in reports and bills.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => void handleBulkDelete()}
      />
    </div>
  )
}

export function EnterpriseKeys() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const search = route.useSearch()
  const { data: enterprise } = useEnterpriseSelf()
  const [sheet, setSheet] = useState<{ token?: EnterpriseToken } | null>(null)
  const [quotaDialog, setQuotaDialog] = useState<{
    tokenIds: number[]
    current?: EnterpriseToken
  } | null>(null)
  const [selectionVersion, setSelectionVersion] = useState(0)
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['enterprise'] })
  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          <span className='flex items-center gap-2'>
            {t('API Keys')}
            <EnterpriseRoleBadge />
          </span>
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          {enterprise && (
            <Button size='sm' onClick={() => setSheet({})}>
              <Plus className='h-4 w-4' />
              {t('Create API Key')}
            </Button>
          )}
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <EnterpriseGuard>
            <KeysTable
              onEdit={(token) => setSheet({ token })}
              onQuotaPolicy={(tokenIds, current) =>
                setQuotaDialog({ tokenIds, current })
              }
              selectionVersion={selectionVersion}
            />
          </EnterpriseGuard>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <TokenMutateSheet
        open={sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
        token={sheet?.token}
        defaultTeamId={search.team_id}
        onSaved={refresh}
      />
      <TokenQuotaPolicyDialog
        open={quotaDialog !== null}
        onOpenChange={(open) => !open && setQuotaDialog(null)}
        tokenIds={quotaDialog?.tokenIds ?? []}
        current={quotaDialog?.current}
        onSaved={() => {
          setSelectionVersion((version) => version + 1)
          refresh()
        }}
      />
    </>
  )
}
