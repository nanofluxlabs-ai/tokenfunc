// TokenFunc 二开：用户管理第三个页签「用户分组」——注册表列表、拖拽排序、删除确认与两个抽屉。
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'
import { Reorder } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMediaQuery } from '@/hooks'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import {
  deleteUserGroup,
  listUserGroups,
  reorderUserGroups,
  tokenFuncGroupQueryKeys,
  type UserGroupItem,
} from '@/lib/tokenfunc-groups'

import { UserGroupMutateDrawer } from './user-group-mutate-drawer'
import { UserGroupPricingDrawer } from './user-group-pricing-drawer'
import { UserGroupRow } from './user-group-row'
import { useUserGroups } from './user-groups-provider'

export function UserGroupsPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = useUserGroups()
  return (
    <Button
      size='sm'
      onClick={() => {
        setCurrentRow(null)
        setOpen('create')
      }}
    >
      <Plus className='h-4 w-4' />
      {t('Add user group')}
    </Button>
  )
}

function sameOrder(a: UserGroupItem[], b: UserGroupItem[]) {
  return (
    a.length === b.length &&
    a.every((item, index) => item.key === b[index]?.key)
  )
}

export function UserGroupsPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { open, setOpen, currentRow, setCurrentRow } = useUserGroups()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [isDeleting, setIsDeleting] = useState(false)

  const query = useQuery({
    queryKey: tokenFuncGroupQueryKeys.user,
    queryFn: async () => requireServerSuccess(await listUserGroups()),
  })
  const serverItems = useMemo(() => query.data?.data ?? [], [query.data])
  // 拖拽中的临时顺序；提交成功（列表已刷新）或失败（回滚）后都清掉，回到服务端顺序
  const [draftOrder, setDraftOrder] = useState<UserGroupItem[] | null>(null)
  const items = draftOrder ?? serverItems
  const itemsRef = useRef(items)
  itemsRef.current = items

  const commitOrder = async (ordered: UserGroupItem[]) => {
    if (sameOrder(ordered, serverItems)) {
      setDraftOrder(null)
      return
    }
    try {
      requireServerSuccess(
        await reorderUserGroups(ordered.map((item) => item.key))
      )
      await queryClient.invalidateQueries({
        queryKey: tokenFuncGroupQueryKeys.all,
      })
    } catch (error) {
      handleServerError(error, t('Failed to save the group order'))
    } finally {
      setDraftOrder(null)
    }
  }

  const handleReorder = (keys: string[]) => {
    const byKey = new Map(items.map((item) => [item.key, item]))
    const next = keys.flatMap((key) => byKey.get(key) ?? [])
    setDraftOrder(next)
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setDraftOrder(next)
    void commitOrder(next)
  }

  const openDialog =
    (dialog: 'update' | 'pricing' | 'delete') => (group: UserGroupItem) => {
      setCurrentRow(group)
      setOpen(dialog)
    }

  const handleDelete = async () => {
    if (!currentRow) return
    setIsDeleting(true)
    try {
      const result = await deleteUserGroup(currentRow.key)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('User group deleted'))
      setOpen(null)
      void queryClient.invalidateQueries({
        queryKey: tokenFuncGroupQueryKeys.all,
      })
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsDeleting(false)
    }
  }

  const renderRow = (group: UserGroupItem, index: number) => (
    <UserGroupRow
      key={group.key}
      group={group}
      index={index}
      count={items.length}
      layout={isMobile ? 'card' : 'table'}
      onMove={handleMove}
      onDragEnd={() => void commitOrder(itemsRef.current)}
      onEdit={openDialog('update')}
      onPricing={openDialog('pricing')}
      onDelete={openDialog('delete')}
    />
  )

  let content = null
  if (query.isLoading) {
    content = <LoadingState />
  } else if (items.length === 0) {
    content = (
      <EmptyState
        icon={Users}
        title={t('No user groups yet')}
        description={t(
          'Create a user group to offer different channel groups and prices.'
        )}
      />
    )
  } else if (isMobile) {
    content = (
      <Reorder.Group
        as='ul'
        axis='y'
        values={items.map((item) => item.key)}
        onReorder={handleReorder}
        className='flex flex-col gap-2'
      >
        {items.map(renderRow)}
      </Reorder.Group>
    )
  } else {
    content = (
      <StaticDataTable>
        <TableHeader>
          <TableRow>
            <TableHead className='w-10' aria-label={t('Order')} />
            <TableHead>{t('Key')}</TableHead>
            <TableHead>{t('Name')}</TableHead>
            <TableHead>{t('Type')}</TableHead>
            <TableHead>{t('Description')}</TableHead>
            <TableHead className='text-right'>{t('Users')}</TableHead>
            <TableHead className='text-right'>
              {t('Pricing differences')}
            </TableHead>
            <TableHead className='text-right'>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <Reorder.Group
          as='tbody'
          axis='y'
          values={items.map((item) => item.key)}
          onReorder={handleReorder}
          className='[&>tr]:h-15'
        >
          {items.map(renderRow)}
        </Reorder.Group>
      </StaticDataTable>
    )
  }

  return (
    <>
      <div className='h-full min-h-0 overflow-y-auto'>{content}</div>
      <UserGroupMutateDrawer
        open={open === 'create' || open === 'update'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={open === 'update' ? currentRow || undefined : undefined}
      />
      <UserGroupPricingDrawer
        open={open === 'pricing'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        group={open === 'pricing' ? currentRow || undefined : undefined}
      />
      <ConfirmDialog
        open={open === 'delete'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        title={t('Delete user group {{name}}?', {
          name: currentRow?.key ?? '',
        })}
        desc={t(
          'Users can no longer be assigned to this group. This cannot be undone.'
        )}
        confirmText={t('Delete')}
        destructive
        isLoading={isDeleting}
        handleConfirm={() => void handleDelete()}
      />
    </>
  )
}
