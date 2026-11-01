import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getGroups } from '@/features/users/api'
import { requireServerSuccess } from '@/lib/server-error-message'

const ALL_GROUPS = '__all__'

type GroupFilterSelectProps = {
  /** 空字符串表示不限分组 */
  value: string
  onChange: (group: string) => void
  className?: string
}

/**
 * 分组筛选下拉：选项为系统配置的全部分组（/api/group，与使用日志的分组筛选同一来源与缓存键）。
 * auto 是令牌的自动分组，日志与用户上不会出现，不作为选项。
 */
export function GroupFilterSelect(props: GroupFilterSelectProps) {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => requireServerSuccess(await getGroups()),
  })
  const groups = (data?.data ?? [])
    .filter((group) => group !== 'auto')
    .sort((a, b) => a.localeCompare(b))
  // 已选的分组即使已从系统配置中删掉，也保留为选项，避免下拉显示空白
  if (props.value && !groups.includes(props.value)) groups.push(props.value)
  const options = [
    { value: ALL_GROUPS, label: t('All groups') },
    ...groups.map((group) => ({ value: group, label: group })),
  ]

  return (
    <Select
      items={options}
      value={props.value || ALL_GROUPS}
      onValueChange={(value) => {
        if (value === null) return
        props.onChange(value === ALL_GROUPS ? '' : String(value))
      }}
    >
      <SelectTrigger
        aria-label={t('Group')}
        className={props.className ?? 'w-[160px]'}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
