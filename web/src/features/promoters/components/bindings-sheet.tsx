import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table'
import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { type PickedUser, UserPicker } from '@/components/user-picker'
import { PROMOTER_SOURCE_LABEL_KEYS } from '@/features/promoter-center/components/users-columns'
import { describeUsageScope } from '@/features/promoter-center/lib/format'
import type { PromoterCenterUser } from '@/features/promoter-center/types'
import { formatQuota, formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  bindPromoterUsers,
  listPromoterBindings,
  unbindPromoterUser,
} from '../api'
import { PROMOTER_BATCH_BIND_MAX, PROMOTERS_QUERY_KEY } from '../constants'
import { parseBatchInputs } from '../lib/batch-inputs'
import type { PromoterBindResult, PromoterListItem } from '../types'
import { usePromoters } from './promoters-provider'

type BindingsSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  promoter: PromoterListItem | null
}

type ResultRow = {
  key: string
  input: string
  ok: boolean
  reason: string
}

/** 管理员：某推广人的绑定管理（搜索添加 / 批量绑定 / 已绑定列表 / 解绑） */
export function BindingsSheet(props: BindingsSheetProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { triggerRefresh } = usePromoters()
  const promoterId = props.promoter?.id ?? 0
  const [picked, setPicked] = useState<PickedUser | null>(null)
  const [includeHistory, setIncludeHistory] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const [lastResult, setLastResult] = useState<PromoterBindResult | null>(null)
  const [unbinding, setUnbinding] = useState<PromoterCenterUser | null>(null)

  const bindingsKey = [PROMOTERS_QUERY_KEY, promoterId, 'bindings']
  const bindings = useQuery({
    queryKey: bindingsKey,
    queryFn: async () =>
      requireServerSuccess(await listPromoterBindings(promoterId)).data
        ?.items ?? [],
    enabled: props.open && promoterId > 0,
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: bindingsKey })
    triggerRefresh()
  }

  const bind = useMutation({
    mutationFn: async (inputs: string[]) =>
      requireServerSuccess(
        await bindPromoterUsers(promoterId, {
          inputs,
          include_history: includeHistory,
        })
      ).data,
    onSuccess: (result) => {
      if (!result) return
      setLastResult(result)
      setPicked(null)
      setBatchText('')
      toast.success(
        t('Bound {{bound}} users, {{failed}} failed', {
          bound: result.bound.length,
          failed: result.failed.length,
        })
      )
      refresh()
    },
    onError: (error) => handleServerError(error, t('Failed to bind users')),
  })
  const unbind = useMutation({
    mutationFn: async (userId: number) =>
      requireServerSuccess(await unbindPromoterUser(promoterId, userId)),
    onSuccess: () => {
      toast.success(t('User unbound'))
      setUnbinding(null)
      refresh()
    },
    onError: (error) => handleServerError(error, t('Failed to unbind user')),
  })

  const batchInputs = parseBatchInputs(batchText)
  const batchTooLarge = batchInputs.length > PROMOTER_BATCH_BIND_MAX
  const boundIds = (bindings.data ?? []).map((user) => user.user_id)
  const resultRows: ResultRow[] = lastResult
    ? [
        ...lastResult.bound.map((user) => ({
          key: `ok-${user.id}`,
          input: `${user.username} #${user.id}`,
          ok: true,
          reason: '',
        })),
        ...lastResult.failed.map((failure, index) => ({
          key: `fail-${index}-${failure.input}`,
          input: failure.input,
          ok: false,
          reason: t(failure.reason_key, failure.reason_params),
        })),
      ]
    : []

  return (
    <>
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-[760px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle className='flex items-center gap-2'>
              {t('Manage bindings')}
              <span className='text-muted-foreground text-sm font-normal'>
                {props.promoter?.username}
                <span className='ml-1 font-mono'>
                  #{props.promoter?.user_id}
                </span>
              </span>
            </SheetTitle>
            <SheetDescription>
              {t(
                'Bound users count toward this promoter. By default only consumption after binding counts; tick "Include historical consumption" to count everything.'
              )}
            </SheetDescription>
          </SheetHeader>
          <div className='flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 sm:px-6'>
            <SideDrawerSection>
              <Collapsible open={batchOpen} onOpenChange={setBatchOpen}>
                <div className='flex flex-col gap-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <div className='min-w-0 flex-1 basis-60'>
                      <UserPicker
                        id='binding-user'
                        value={picked}
                        onChange={setPicked}
                        disabledIds={[
                          props.promoter?.user_id ?? 0,
                          ...boundIds,
                        ]}
                        placeholder={t(
                          'Search by username / ID / email to add'
                        )}
                      />
                    </div>
                    <Button
                      size='sm'
                      disabled={!picked || bind.isPending}
                      onClick={() => picked && bind.mutate([String(picked.id)])}
                    >
                      {t('Add')}
                    </Button>
                    <CollapsibleTrigger
                      render={<Button size='sm' variant='outline' />}
                    >
                      {t('Batch bind')}
                      <ChevronDown
                        aria-hidden='true'
                        className={cn(
                          'transition-transform',
                          batchOpen && 'rotate-180'
                        )}
                      />
                    </CollapsibleTrigger>
                  </div>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'Cannot bind: the promoter themselves, admins, or users already assigned to another promoter'
                    )}
                  </p>
                  <div className='flex items-center gap-2'>
                    <Checkbox
                      id='binding-include-history'
                      checked={includeHistory}
                      onCheckedChange={(checked) =>
                        setIncludeHistory(checked === true)
                      }
                    />
                    <Label
                      htmlFor='binding-include-history'
                      className='text-sm font-normal'
                    >
                      {t('Include historical consumption')}
                    </Label>
                  </div>
                </div>
                <CollapsibleContent className='mt-3 flex flex-col gap-3 rounded-lg border p-3'>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'One username or user ID per line, at most {{max}} per batch.',
                      { max: PROMOTER_BATCH_BIND_MAX }
                    )}
                  </p>
                  <Textarea
                    aria-label={t('Batch bind')}
                    value={batchText}
                    rows={4}
                    onChange={(event) => setBatchText(event.target.value)}
                    placeholder={'alice\n1024'}
                  />
                  <div className='flex flex-wrap items-center justify-between gap-3'>
                    <span className='text-muted-foreground text-xs'>
                      {batchTooLarge
                        ? t('At most {{max}} users per batch', {
                            max: PROMOTER_BATCH_BIND_MAX,
                          })
                        : t('{{count}} entries', { count: batchInputs.length })}
                    </span>
                    <Button
                      size='sm'
                      disabled={
                        batchInputs.length === 0 ||
                        batchTooLarge ||
                        bind.isPending
                      }
                      onClick={() => bind.mutate(batchInputs)}
                    >
                      {t('Bind all')}
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
              {resultRows.length > 0 && (
                <StaticDataTable
                  columns={[
                    {
                      id: 'input',
                      header: t('Input'),
                      cell: (row: ResultRow) => row.input,
                    },
                    {
                      id: 'status',
                      header: t('Result'),
                      cell: (row: ResultRow) =>
                        row.ok ? (
                          <StatusBadge
                            label={t('Bound')}
                            variant='success'
                            size='sm'
                            copyable={false}
                          />
                        ) : (
                          <span className='text-destructive text-xs'>
                            {row.reason}
                          </span>
                        ),
                    },
                  ]}
                  data={resultRows}
                  getRowKey={(row) => row.key}
                />
              )}
            </SideDrawerSection>

            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Bound users')}
                description={t(
                  'Consumption column is the current month, net of refunds.'
                )}
              />
              <StaticDataTable
                columns={[
                  {
                    id: 'user',
                    header: t('User'),
                    cell: (user: PromoterCenterUser) => (
                      <div className='flex min-w-0 flex-col'>
                        <span className='truncate font-medium'>
                          {user.username || `#${user.user_id}`}
                          <span className='text-muted-foreground ml-1 font-mono text-xs'>
                            #{user.user_id}
                          </span>
                        </span>
                        {user.email && (
                          <span className='text-muted-foreground truncate text-xs'>
                            {user.email}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: 'group',
                    header: t('Group'),
                    cell: (user: PromoterCenterUser) =>
                      user.group ? (
                        <StatusBadge
                          label={user.group}
                          variant='neutral'
                          size='sm'
                          copyable={false}
                        />
                      ) : (
                        <span className='text-muted-foreground'>-</span>
                      ),
                  },
                  {
                    id: 'source',
                    header: t('Source'),
                    cell: (user: PromoterCenterUser) => (
                      <div className='flex flex-col text-xs'>
                        <span>
                          {t(PROMOTER_SOURCE_LABEL_KEYS[user.source])}
                        </span>
                        <span className='text-muted-foreground'>
                          {describeUsageScope(user, t)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    id: 'bound_at',
                    header: t('Bound at'),
                    cell: (user: PromoterCenterUser) =>
                      formatTimestampToDate(user.bound_at),
                  },
                  {
                    id: 'operator',
                    header: t('Operator'),
                    cell: (user: PromoterCenterUser) =>
                      user.bound_by_username || (
                        <span className='text-muted-foreground'>-</span>
                      ),
                  },
                  {
                    id: 'month',
                    header: t('Month consumption'),
                    className: 'text-right',
                    cellClassName: 'text-right font-mono tabular-nums',
                    cell: (user: PromoterCenterUser) =>
                      formatQuota(user.net_quota),
                  },
                  {
                    id: 'actions',
                    header: '',
                    className: 'w-10',
                    cell: (user: PromoterCenterUser) => (
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        aria-label={t('Unbind')}
                        onClick={() => setUnbinding(user)}
                      >
                        <Trash2 />
                      </Button>
                    ),
                  },
                ]}
                data={bindings.data ?? []}
                tableClassName='min-w-[760px]'
                getRowKey={(user) => user.user_id}
                empty={
                  !bindings.isLoading && (bindings.data ?? []).length === 0
                }
                emptyContent={t('No bound users yet')}
              />
            </SideDrawerSection>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={unbinding !== null}
        onOpenChange={(open) => !open && setUnbinding(null)}
        title={t('Unbind user')}
        desc={t(
          'Unbind {{username}} from this promoter? Their consumption will no longer count toward the promoter.',
          { username: unbinding?.username ?? '' }
        )}
        destructive
        confirmText={t('Unbind')}
        isLoading={unbind.isPending}
        handleConfirm={() => unbinding && unbind.mutate(unbinding.user_id)}
      />
    </>
  )
}
