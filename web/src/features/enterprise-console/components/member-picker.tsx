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
import { useDebounce } from '@/hooks/use-debounce'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { listMembers } from '../api'

/** 下拉里的特殊值：-1 表示"全部"（仅筛选场景），0 表示未指定成员 */
export const MEMBER_PICKER_ANY = -1

type MemberOption = { value: number; label: string; description?: string }

type MemberPickerProps = {
  value: number
  onChange: (value: number) => void
  /** 已选成员的显示名；当该成员不在当前搜索结果里时用来回显 */
  selectedLabel?: string
  noneLabel: string
  /** 是否提供"全部成员"选项（筛选场景） */
  allowAny?: boolean
  /** 只列某个团队的成员（key 归属场景：持有人必须属于该团队） */
  teamId?: number
  id?: string
  'aria-label'?: string
}

/**
 * 可搜索的成员选择器：外观与团队用的 Select 触发器一致，
 * 搜索框放在弹层内，按关键字从服务端搜索在职成员（最多 20 条），
 * 避免一次性加载全部成员撞上分页上限。
 */
export function MemberPicker(props: MemberPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const keyword = useDebounce(search.trim(), 300)

  const { data, isFetching } = useQuery({
    queryKey: ['enterprise', 'members', 'picker', props.teamId ?? 0, keyword],
    queryFn: async () =>
      requireServerSuccess(
        await listMembers({
          status: 'active',
          team_id: props.teamId || undefined,
          keyword: keyword || undefined,
          page_size: 20,
        })
      ).data?.items ?? [],
    enabled: open,
    staleTime: 30 * 1000,
  })

  const options = useMemo<MemberOption[]>(() => {
    const fixed: MemberOption[] = []
    if (props.allowAny) {
      fixed.push({ value: MEMBER_PICKER_ANY, label: t('All Members') })
    }
    fixed.push({ value: 0, label: props.noneLabel })
    const fromServer: MemberOption[] = (data ?? []).map((member) => ({
      value: member.id,
      label: member.name,
      description: [member.team_name, member.employee_no]
        .filter(Boolean)
        .join(' · '),
    }))
    const hasSelected =
      props.value <= 0 ||
      fromServer.some((option) => option.value === props.value)
    if (!hasSelected && props.selectedLabel) {
      fromServer.unshift({ value: props.value, label: props.selectedLabel })
    }
    return [...fixed, ...fromServer]
  }, [
    data,
    props.allowAny,
    props.noneLabel,
    props.value,
    props.selectedLabel,
    t,
  ])

  const selected =
    options.find((option) => option.value === props.value) ?? null
  // 弹层未打开时搜索结果可能为空，已选成员靠 selectedLabel 回显
  const displayedLabel = selected?.label ?? props.selectedLabel ?? ''

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
      onValueChange={(option) => {
        if (option) props.onChange(option.value)
      }}
      // 搜索在服务端完成，这里不做二次过滤
      filter={() => true}
      isItemEqualToValue={(item, value) => item.value === value.value}
      itemToStringLabel={(item) => item.label}
    >
      <ComboboxTrigger
        id={props.id}
        aria-label={props['aria-label']}
        icon={UnfoldMoreIcon}
        className={cn(selectTriggerClassName, 'w-full')}
        data-size='default'
      >
        <ComboboxValue>
          {() => <span className='truncate'>{displayedLabel}</span>}
        </ComboboxValue>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput
          placeholder={t('Search members...')}
          aria-label={t('Search members...')}
          showTrigger={false}
        />
        <ComboboxEmpty>
          {isFetching ? t('Loading...') : t('No results found')}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: MemberOption) => (
            <ComboboxItem key={option.value} value={option}>
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
