import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useChannelGroupOptions,
  useUserGroupOptions,
  userGroupOptionLabel,
} from '@/hooks/use-group-options'

const ALL_GROUPS = '__all__'

type GroupFilterSelectProps = {
  /** 空字符串表示不限分组 */
  value: string
  onChange: (group: string) => void
  className?: string
  /**
   * 按哪个维度筛：用户消耗按 users.group（用户分组），模型消费 / 账单按 logs.group（渠道分组）。
   * 两张注册表都来自 TokenFunc 二开接口，选项按后台排序并显示名称。
   */
  kind: 'user' | 'channel'
}

export function GroupFilterSelect(props: GroupFilterSelectProps) {
  const { t } = useTranslation()
  const userGroups = useUserGroupOptions({ enabled: props.kind === 'user' })
  const channelGroups = useChannelGroupOptions({
    enabled: props.kind === 'channel',
  })
  const groups = (
    props.kind === 'user' ? userGroups.options : channelGroups.options
  ).map((option) => ({
    value: option.value,
    label: userGroupOptionLabel(option),
  }))
  // 已选的分组即使已从注册表里删掉，也保留为选项，避免下拉显示空白
  if (props.value && !groups.some((group) => group.value === props.value)) {
    groups.push({ value: props.value, label: props.value })
  }
  const options = [{ value: ALL_GROUPS, label: t('All groups') }, ...groups]

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
