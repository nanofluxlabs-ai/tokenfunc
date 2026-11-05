// TokenFunc 二开：系统设置 › 模型 › 分组定价 Tab 的内容。
// 默认模式是渠道分组编辑器；「高级编辑器」直接渲染上游 GroupRatioForm（含可视化 / JSON 与保存按钮）。
import { Link } from '@tanstack/react-router'
import { Code2, ListTree } from 'lucide-react'
import { memo, useCallback, useState, type ComponentProps } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import {
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../../components/settings-form-layout'
import { SettingsPageActionsPortal } from '../../components/settings-page-context'
import { safeNumberFieldProps } from '../../utils/numeric-field'
import { GroupRatioForm } from '../group-ratio-form'
import { ChannelGroupsEditor } from './channel-groups-editor'
import type { ChannelGroupFormValues } from './lib/serialization'

export type GroupFormValues = ChannelGroupFormValues & {
  MaxTokenAutoGroups: number
  DefaultUseAutoGroup: boolean
}

type UpstreamGroupForm = ComponentProps<typeof GroupRatioForm>['form']

type ChannelGroupsFormProps = {
  form: UseFormReturn<GroupFormValues>
  onSave: (values: GroupFormValues) => Promise<void>
  isSaving: boolean
}

export const ChannelGroupsForm = memo(function ChannelGroupsForm(
  props: ChannelGroupsFormProps
) {
  const { t } = useTranslation()
  const form = props.form
  const values = useWatch({ control: form.control })
  const [advanced, setAdvanced] = useState(false)
  const [autoOpen, setAutoOpen] = useState(false)
  const [rowsValid, setRowsValid] = useState(true)

  const handleFieldChange = useCallback(
    (field: keyof ChannelGroupFormValues, value: string) => {
      form.setValue(field, value, { shouldDirty: true, shouldValidate: true })
    },
    [form]
  )

  const modeSwitcher = (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <p className='text-muted-foreground text-sm'>
        {advanced
          ? t(
              'Advanced editor exposes every upstream group option, including user group overrides.'
            )
          : t(
              'Channel groups decide which channel pool a request uses and its base ratio.'
            )}
      </p>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => setAdvanced((prev) => !prev)}
      >
        {advanced ? (
          <>
            <ListTree className='mr-2 h-4 w-4' aria-hidden='true' />
            {t('Back to channel groups')}
          </>
        ) : (
          <>
            <Code2 className='mr-2 h-4 w-4' aria-hidden='true' />
            {t('Advanced editor')}
          </>
        )}
      </Button>
    </div>
  )

  if (advanced) {
    return (
      <div className='space-y-6'>
        {modeSwitcher}
        <GroupRatioForm
          // 上游表单类型不含二开的 ChannelGroupsRegistry 字段，运行时是同一个 form 实例
          form={form as unknown as UpstreamGroupForm}
          onSave={() => props.onSave(form.getValues())}
          isSaving={props.isSaving}
        />
      </div>
    )
  }

  const channelGroupValues: ChannelGroupFormValues = {
    GroupRatio: values.GroupRatio ?? '',
    TopupGroupRatio: values.TopupGroupRatio ?? '',
    UserUsableGroups: values.UserUsableGroups ?? '',
    GroupGroupRatio: values.GroupGroupRatio ?? '',
    AutoGroups: values.AutoGroups ?? '',
    GroupSpecialUsableGroup: values.GroupSpecialUsableGroup ?? '',
    ChannelGroupsRegistry: values.ChannelGroupsRegistry ?? '',
  }

  return (
    <div className='space-y-6'>
      {modeSwitcher}

      <Form {...form}>
        <SettingsPageActionsPortal>
          <Button
            type='button'
            size='sm'
            disabled={props.isSaving || !rowsValid}
            onClick={form.handleSubmit(props.onSave, (errors) => {
              if (errors.MaxTokenAutoGroups) {
                setAutoOpen(true)
                requestAnimationFrame(() => form.setFocus('MaxTokenAutoGroups'))
                return
              }
              // 其它字段的 JSON 错误只有高级编辑器能展示与修复
              setAdvanced(true)
            })}
          >
            {props.isSaving ? t('Saving...') : t('Save group settings')}
          </Button>
        </SettingsPageActionsPortal>

        <ChannelGroupsEditor
          values={channelGroupValues}
          onChange={handleFieldChange}
          onValidityChange={setRowsValid}
          autoOpen={autoOpen}
          onAutoOpenChange={setAutoOpen}
          defaultUseAutoGroupField={
            <FormField
              control={form.control}
              name='DefaultUseAutoGroup'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Default to auto groups')}</FormLabel>
                    <FormDescription>
                      {t(
                        'If default auto group is enabled, newly created tokens start with auto instead of an empty group.'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />
          }
          maxTokenAutoGroupsField={
            <FormField
              control={form.control}
              name='MaxTokenAutoGroups'
              render={({ field, fieldState }) => (
                <FormItem data-invalid={fieldState.invalid}>
                  <FormLabel>{t('Maximum custom groups per token')}</FormLabel>
                  <FormControl>
                    <Input
                      {...safeNumberFieldProps(field)}
                      type='number'
                      min={1}
                      step={1}
                      aria-invalid={fieldState.invalid}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Limits only token-specific Auto snapshots. Global Auto inheritance remains unlimited.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          }
        />
      </Form>

      <p className='text-muted-foreground text-sm'>
        {t(
          'User groups and their differential pricing are managed under User management › User groups.'
        )}{' '}
        <Link
          to='/users'
          // 用户分组页签由用户管理页的改造加入 search 枚举，这里不依赖其类型
          search={{ type: 'group' }}
          className='text-primary underline underline-offset-4'
        >
          {t('Go to user groups')}
        </Link>
      </p>
    </div>
  )
})
