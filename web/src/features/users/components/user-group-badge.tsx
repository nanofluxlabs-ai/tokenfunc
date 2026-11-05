// TokenFunc 二开：用户列表里的分组徽章，显示用户分组注册表里的名称，悬浮 key。
// 名称查询放在单元格内而不是列定义里，避免注册表返回时整张表重建。
import { GroupBadge } from '@/components/group-badge'
import { useUserGroupOptions } from '@/hooks/use-group-options'

export function UserGroupBadge(props: { group: string; className?: string }) {
  const { options } = useUserGroupOptions()
  const label = options.find((option) => option.key === props.group)?.label
  return (
    <GroupBadge
      group={props.group}
      label={label}
      title={props.group}
      className={props.className}
    />
  )
}
