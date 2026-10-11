import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type OptionSelectProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  id?: string
  className?: string
  'aria-label'?: string
}

/** 报价单配置里的字符串枚举下拉（表格样式 / 组尾说明块 / 分组 / 子组）；空字符串是合法取值 */
export function OptionSelect<T extends string>(props: OptionSelectProps<T>) {
  return (
    <Select
      items={props.options}
      value={props.value}
      onValueChange={(value) => {
        if (value !== null) props.onChange(value as T)
      }}
    >
      <SelectTrigger
        id={props.id}
        aria-label={props['aria-label']}
        className={props.className ?? 'w-full'}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
