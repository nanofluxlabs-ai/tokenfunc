// TokenFunc 二开：某个用户分组的渠道分组定价抽屉。
// 口径是「基准价 + 覆盖」：每行只记录可见与倍率覆盖，倍率留空 = 继承渠道分组的基准倍率。
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { handleServerError } from '@/lib/handle-server-error'
import {
  requireServerSuccess,
  translateServerText,
} from '@/lib/server-error-message'
import {
  getUserGroupPricing,
  saveUserGroupPricing,
  tokenFuncGroupQueryKeys,
  type UserGroupItem,
  type UserGroupPricingInput,
  type UserGroupPricingRow,
} from '@/lib/tokenfunc-groups'
import { cn } from '@/lib/utils'

type UserGroupPricingDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: UserGroupItem
}

/** 用户在抽屉里改过的格子；倍率按输入原文保存，提交时再转数字 */
type RowEdit = { visible: boolean; ratio: string }

/** 一行的展示态：服务端数据叠加本地编辑 */
type PricingRowView = UserGroupPricingRow & {
  label: string
  ratioText: string
  /** 倍率输入非空但不是 ≥0 的数字 */
  ratioInvalid: boolean
  /** 与基准不同：可见性翻转或填了倍率 */
  differs: boolean
}

function parseRatioText(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function UserGroupPricingDrawer(props: UserGroupPricingDrawerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const group = props.group
  const groupKey = group?.key ?? ''
  const [edits, setEdits] = useState<Record<string, RowEdit>>({})
  const [onlyDifferences, setOnlyDifferences] = useState(false)
  const [search, setSearch] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const query = useQuery({
    queryKey: tokenFuncGroupQueryKeys.userPricing(groupKey),
    queryFn: async () =>
      requireServerSuccess(await getUserGroupPricing(groupKey)),
    enabled: props.open && groupKey !== '',
  })

  // 打开或换了分组就丢掉上一轮的编辑与筛选
  useEffect(() => {
    if (!props.open) return
    setEdits({})
    setOnlyDifferences(false)
    setSearch('')
  }, [props.open, groupKey])

  const rows = useMemo<PricingRowView[]>(
    () =>
      (query.data?.data ?? []).map((row) => {
        const edit = edits[row.channel_group]
        const visible = edit?.visible ?? row.visible
        const ratioText =
          edit?.ratio ?? (row.ratio === null ? '' : String(row.ratio))
        const ratioInvalid =
          visible &&
          ratioText.trim() !== '' &&
          parseRatioText(ratioText) === null
        return {
          ...row,
          visible,
          label: translateServerText(t, row.label) || row.channel_group,
          ratioText,
          ratioInvalid,
          differs: visible !== row.default_visible || ratioText.trim() !== '',
        }
      }),
    [query.data, edits, t]
  )

  const visibleRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (onlyDifferences && !row.differs) return false
      if (keyword === '') return true
      return (
        row.channel_group.toLowerCase().includes(keyword) ||
        row.label.toLowerCase().includes(keyword)
      )
    })
  }, [rows, onlyDifferences, search])

  const updateRow = (row: PricingRowView, patch: Partial<RowEdit>) => {
    setEdits((previous) => ({
      ...previous,
      [row.channel_group]: {
        visible: row.visible,
        ratio: row.ratioText,
        ...patch,
      },
    }))
  }

  const columns: StaticDataTableColumn<PricingRowView>[] = [
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
          disabled={row.locked || isSubmitting}
          aria-label={t('Visible for {{group}}', { group: row.label })}
          onCheckedChange={(checked) =>
            // 取消可见后倍率没有意义：一起清空，提交时 ratio 为 null
            updateRow(
              row,
              checked ? { visible: true } : { visible: false, ratio: '' }
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
          disabled={!row.visible || isSubmitting}
          aria-invalid={row.ratioInvalid || undefined}
          aria-label={t('Ratio override for {{group}}', { group: row.label })}
          className='font-mono tabular-nums'
          onChange={(event) => updateRow(row, { ratio: event.target.value })}
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

  const onSave = async () => {
    if (!group) return
    if (rows.some((row) => row.ratioInvalid)) {
      toast.error(t('Ratio must be a number of 0 or more'))
      return
    }
    // 后端按全量切片处理：提交当前表里的全部行，而不只是改过的
    const payload: UserGroupPricingInput[] = rows.map((row) => ({
      channel_group: row.channel_group,
      visible: row.visible,
      ratio: row.visible ? parseRatioText(row.ratioText) : null,
    }))
    setIsSubmitting(true)
    try {
      const result = await saveUserGroupPricing(group.key, payload)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Pricing saved'))
      props.onOpenChange(false)
      // all 覆盖了注册表（override_count）与本分组的定价缓存
      void queryClient.invalidateQueries({
        queryKey: tokenFuncGroupQueryKeys.all,
      })
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const groupLabel = group
    ? translateServerText(t, group.label) || group.key
    : ''

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[760px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle className='flex min-w-0 flex-wrap items-center gap-2'>
            <span>
              {t('Channel group pricing of {{name}}', { name: groupLabel })}
            </span>
            {group && (
              <span className='text-muted-foreground font-mono text-sm font-normal'>
                {group.key}
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            {t(
              'Leave the ratio empty to inherit the base ratio of the channel group; hidden channel groups are not offered to users of this group.'
            )}
          </SheetDescription>
        </SheetHeader>
        <div className={sideDrawerFormClassName('gap-4')}>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
            <Label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={onlyDifferences}
                onCheckedChange={(checked) =>
                  setOnlyDifferences(checked === true)
                }
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
          {query.isLoading ? (
            <LoadingState size='sm' />
          ) : (
            <div className='overflow-x-auto'>
              <StaticDataTable
                columns={columns}
                data={visibleRows}
                getRowKey={(row) => row.channel_group}
                tableClassName='min-w-[560px]'
                emptyContent={
                  rows.length === 0
                    ? t('No channel groups')
                    : t('No matching channel groups')
                }
              />
            </div>
          )}
        </div>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Cancel')}
          </SheetClose>
          <Button
            type='button'
            onClick={() => void onSave()}
            disabled={isSubmitting || query.isLoading || !group}
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
