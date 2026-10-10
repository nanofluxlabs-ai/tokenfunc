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
  useComboboxAnchor,
} from '@/components/ui/combobox'
import { useDebounce } from '@/hooks/use-debounce'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listEmployees } from '../api'

/** 下拉里的特殊值：-1 表示"全部"（仅筛选场景），0 表示未指定员工 */
export const EMPLOYEE_PICKER_ANY = -1

type EmployeeOption = { value: number; label: string; description?: string }

type EmployeePickerProps = {
  value: number
  onChange: (value: number) => void
  /** 已选员工的显示名；当该员工不在当前搜索结果里时用来回显 */
  selectedLabel?: string
  noneLabel: string
  /** 是否提供"全部员工"选项（筛选场景） */
  allowAny?: boolean
  id?: string
  'aria-label'?: string
}

/**
 * 可搜索的员工选择器：按关键字从服务端搜索在职员工（最多 20 条），
 * 避免一次性加载全部员工撞上分页上限。
 */
export function EmployeePicker(props: EmployeePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const keyword = useDebounce(search.trim(), 300)
  const anchor = useComboboxAnchor()

  const { data, isFetching } = useQuery({
    queryKey: ['enterprise', 'employees', 'picker', keyword],
    queryFn: async () =>
      requireServerSuccess(
        await listEmployees({
          status: 'active',
          keyword: keyword || undefined,
          page_size: 20,
        })
      ).data?.items ?? [],
    enabled: open,
    staleTime: 30 * 1000,
  })

  const options = useMemo<EmployeeOption[]>(() => {
    const fixed: EmployeeOption[] = []
    if (props.allowAny) {
      fixed.push({ value: EMPLOYEE_PICKER_ANY, label: t('All Employees') })
    }
    fixed.push({ value: 0, label: props.noneLabel })
    const fromServer: EmployeeOption[] = (data ?? []).map((employee) => ({
      value: employee.id,
      label: employee.name,
      description: [employee.department_name, employee.employee_no]
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
  const displayedValue = selected?.label ?? props.selectedLabel ?? ''

  return (
    <Combobox
      items={options}
      value={selected}
      open={open}
      inputValue={open ? search : displayedValue}
      onInputValueChange={(value, details) => {
        if (details.reason === 'input-change') setSearch(value)
      }}
      onOpenChange={(nextOpen, details) => {
        setOpen(nextOpen)
        if (details.reason !== 'input-change') setSearch('')
      }}
      onValueChange={(option) => {
        if (option) props.onChange(option.value)
      }}
      // 搜索在服务端完成，这里不做二次过滤
      filter={() => true}
      isItemEqualToValue={(item, value) => item.value === value.value}
    >
      <div ref={anchor} className='min-w-0'>
        <ComboboxInput
          id={props.id}
          aria-label={props['aria-label']}
          placeholder={t('Search employees...')}
          triggerAriaLabel={props['aria-label'] ?? t('Open')}
          className='h-full min-h-8 w-full'
        />
      </div>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>
          {isFetching ? t('Loading...') : t('No results found')}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: EmployeeOption) => (
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
