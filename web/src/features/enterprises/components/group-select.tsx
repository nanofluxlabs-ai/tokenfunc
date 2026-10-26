import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Combobox } from '@/components/ui/combobox'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listEnterpriseGroupOptions } from '../api'

type GroupSelectProps = {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  // FormControl 注入的可访问性属性，透传给输入框
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/** 企业主账号分组：选项来自管理员可分配的分组，显示为「vip · 0.8×」 */
export function GroupSelect(props: GroupSelectProps) {
  const { t } = useTranslation()
  const groups = useQuery({
    queryKey: ['admin-enterprise-group-options'],
    queryFn: async () =>
      requireServerSuccess(await listEnterpriseGroupOptions()).data ?? [],
  })
  const options = (groups.data ?? []).map((option) => ({
    value: option.group,
    label: `${option.group} · ${option.ratio}×`,
  }))

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
