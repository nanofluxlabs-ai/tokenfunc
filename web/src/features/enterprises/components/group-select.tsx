import { useTranslation } from 'react-i18next'

import { Combobox } from '@/components/ui/combobox'
import {
  useUserGroupOptions,
  userGroupOptionLabel,
} from '@/hooks/use-group-options'

type GroupSelectProps = {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  // FormControl 注入的可访问性属性，透传给输入框
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/** 企业主账号分组：用户分组注册表里的企业档位加 default，显示名称并括注 key */
export function GroupSelect(props: GroupSelectProps) {
  const { t } = useTranslation()
  const { options: userGroupOptions } = useUserGroupOptions()
  const options = userGroupOptions
    .filter(
      (option) => option.kind === 'enterprise' || option.key === 'default'
    )
    .map((option) => ({
      value: option.value,
      label: userGroupOptionLabel(option),
    }))
  // 企业当前分组已不在候选里时仍保留，避免下拉显示空白
  if (props.value && !options.some((option) => option.value === props.value)) {
    options.push({ value: props.value, label: props.value })
  }

  return (
    <Combobox
      id={props.id}
      aria-describedby={props['aria-describedby']}
      aria-invalid={props['aria-invalid']}
      options={options}
      value={props.value}
      onValueChange={(value) => value !== null && props.onValueChange(value)}
      disabled={props.disabled}
      className='w-full'
      placeholder={t('Select a group')}
    />
  )
}
