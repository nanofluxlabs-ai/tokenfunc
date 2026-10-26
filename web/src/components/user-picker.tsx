import { UnfoldMoreIcon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox'
import { selectTriggerClassName } from '@/components/ui/select'
import { searchUsers } from '@/features/users/api'
import type { UserListType } from '@/features/users/types'
import { useDebounce } from '@/hooks/use-debounce'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

/** 用户选择器选中的用户摘要 */
export interface PickedUser {
  id: number
  username: string
  display_name: string
  role: number
  /** 用户当前分组；搜索结果里总会带上 */
  group?: string
}

type UserOption = {
  value: number
  label: string
  description: string
  disabled: boolean
  user: PickedUser
}

type UserPickerProps = {
  value: PickedUser | null
  onChange: (user: PickedUser | null) => void
  /** 已在名下 / 已选等不可再选的用户 */
  disabledIds?: number[]
  /** 管理员账号不可选（不能当推广人、不能被绑定） */
  disableAdmins?: boolean
  /** 只搜某类用户，如 personal：排除企业主与企业员工 */
  userType?: UserListType
  id?: string
  'aria-label'?: string
  // FormControl 注入的可访问性属性，透传给触发按钮
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  placeholder?: string
}

/**
 * 可搜索的「已有用户」选择器：按用户名 / ID / 邮箱 / 显示名从服务端搜索启用中的用户（最多 10 条）。
 * 推广人与企业升级共用；照 enterprise-console/employee-picker 的 Combobox + useDebounce + useQuery 组合实现。
 */
export function UserPicker(props: UserPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const keyword = useDebounce(search.trim(), 300)

  const { data, isFetching } = useQuery({
    queryKey: ['users', 'picker', props.userType ?? 'all', keyword],
    queryFn: async () =>
      requireServerSuccess(
        await searchUsers({
          keyword,
          status: '1',
          p: 1,
          page_size: 10,
          user_type: props.userType,
        })
      ).data?.items ?? [],
    enabled: open,
    staleTime: 30 * 1000,
  })

  const options = useMemo<UserOption[]>(() => {
    const disabledIds = new Set(props.disabledIds ?? [])
    const fromServer: UserOption[] = (data ?? []).map((user) => ({
      value: user.id,
      label: `${user.username} #${user.id}`,
      description: user.display_name || '',
      disabled:
        disabledIds.has(user.id) ||
        (props.disableAdmins !== false && user.role >= ROLE.ADMIN),
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        group: user.group,
      },
    }))
    if (
      props.value &&
      !fromServer.some((option) => option.value === props.value?.id)
    ) {
      fromServer.unshift({
        value: props.value.id,
        label: `${props.value.username} #${props.value.id}`,
        description: props.value.display_name || '',
        disabled: false,
        user: props.value,
      })
    }
    return fromServer
  }, [data, props.disableAdmins, props.disabledIds, props.value])

  const selected =
    options.find((option) => option.value === props.value?.id) ?? null

  return (
    <Combobox
      items={options}
      value={selected}
      open={open}
      inputValue={search}
      onInputValueChange={(value, details) => {
        if (details.reason === 'input-change') setSearch(value)
      }}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setSearch('')
      }}
      onValueChange={(option) => props.onChange(option ? option.user : null)}
      // 搜索在服务端完成，这里不做二次过滤
      filter={() => true}
      isItemEqualToValue={(item, value) => item.value === value.value}
      itemToStringLabel={(item) => item.label}
    >
      <ComboboxTrigger
        id={props.id}
        aria-label={props['aria-label'] ?? t('Select user')}
        aria-describedby={props['aria-describedby']}
        aria-invalid={props['aria-invalid']}
        icon={UnfoldMoreIcon}
        className={cn(selectTriggerClassName, 'w-full')}
        data-size='default'
      >
        <ComboboxValue>
          {() => (
            <span
              className={cn('truncate', !selected && 'text-muted-foreground')}
            >
              {selected?.label ?? props.placeholder ?? t('Select user')}
            </span>
          )}
        </ComboboxValue>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput
          placeholder={t('Search by username, ID or email...')}
          aria-label={t('Search by username, ID or email...')}
          showTrigger={false}
        />
        <ComboboxEmpty>
          {isFetching ? t('Loading...') : t('No results found')}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: UserOption) => (
            <ComboboxItem
              key={option.value}
              value={option}
              disabled={option.disabled}
            >
              <span className='min-w-0 break-words'>
                {option.label}
                {option.description && (
                  <span className='text-muted-foreground block text-xs'>
                    {option.description}
                  </span>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
