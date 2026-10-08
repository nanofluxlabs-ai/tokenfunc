import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type EntityOption = { value: number; label: string; disabled?: boolean }

type EntitySelectProps = {
  value: number
  onChange: (value: number) => void
  options: EntityOption[]
  /** 值为 0 的"无"选项文案 */
  noneLabel: string
  id?: string
  'aria-label'?: string
}

/** 部门 / 员工 / 项目等实体的下拉选择，0 表示不选 */
export function EntitySelect(props: EntitySelectProps) {
  const items = [
    { value: '0', label: props.noneLabel },
    ...props.options.map((option) => ({
      value: String(option.value),
      label: option.label,
    })),
  ]
  return (
    <Select
      items={items}
      value={String(props.value)}
      onValueChange={(value) => value !== null && props.onChange(Number(value))}
    >
      <SelectTrigger
        id={props.id}
        aria-label={props['aria-label']}
        className='w-full'
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectItem value='0'>{props.noneLabel}</SelectItem>
          {props.options.map((option) => (
            <SelectItem
              key={option.value}
              value={String(option.value)}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
