// TokenFunc 二开：系统设置 › 模型 › 分组定价 Tab 的内容。
// 自上而下两段：渠道分组（本表单，右上角「保存分组设置」只管这一段）、
// 用户分组定价（用户管理模块的面板，自带保存，这里只做挂载）。
import { useQueryClient } from '@tanstack/react-query'
import { memo, useCallback, useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { UserGroupPricingPanel } from '@/features/users/groups'
import { tokenFuncGroupQueryKeys } from '@/lib/tokenfunc-groups'

import {
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../../components/settings-form-layout'
import { SettingsPageActionsPortal } from '../../components/settings-page-context'
import { safeNumberFieldProps } from '../../utils/numeric-field'
import { ChannelGroupsEditor } from './channel-groups-editor'
import type { ChannelGroupFormValues } from './lib/serialization'

export type GroupFormValues = ChannelGroupFormValues & {
  MaxTokenAutoGroups: number
  DefaultUseAutoGroup: boolean
}

type ChannelGroupsFormProps = {
  form: UseFormReturn<GroupFormValues>
  onSave: (values: GroupFormValues) => Promise<void>
  isSaving: boolean
}

const sectionCardClassName = 'min-w-0 shadow-none'
const sectionHeaderClassName = 'gap-2 border-b'

export const ChannelGroupsForm = memo(function ChannelGroupsForm(
  props: ChannelGroupsFormProps
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const form = props.form
  const values = useWatch({ control: form.control })
  const [autoOpen, setAutoOpen] = useState(false)
  const [rowsValid, setRowsValid] = useState(true)

  const handleFieldChange = useCallback(
    (field: keyof ChannelGroupFormValues, value: string) => {
      form.setValue(field, value, { shouldDirty: true, shouldValidate: true })
    },
    [form]
  )

  // 段一保存成功后让分组注册表缓存失效，段二的基准倍率 / 默认可见随之刷新
  const onSave = props.onSave
  const handleSave = useCallback(
    async (formValues: GroupFormValues) => {
      await onSave(formValues)
      await queryClient.invalidateQueries({
        queryKey: tokenFuncGroupQueryKeys.all,
      })
    },
    [onSave, queryClient]
  )

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
    <div className='flex min-w-0 flex-col gap-6'>
      <Form {...form}>
        <SettingsPageActionsPortal>
          <Button
            type='button'
            size='sm'
            disabled={props.isSaving || !rowsValid}
            onClick={form.handleSubmit(handleSave, (errors) => {
              if (errors.MaxTokenAutoGroups) {
                setAutoOpen(true)
                requestAnimationFrame(() => form.setFocus('MaxTokenAutoGroups'))
                return
              }
              // 其它字段都由编辑器序列化生成，正常情况下不会出错；兜底提示而不是静默
              toast.error(t('Fix invalid group settings before saving.'))
            })}
          >
            {props.isSaving ? t('Saving...') : t('Save group settings')}
          </Button>
        </SettingsPageActionsPortal>

        <Card className={sectionCardClassName}>
          <CardHeader className={sectionHeaderClassName}>
            <CardTitle>{t('Channel groups')}</CardTitle>
            <CardDescription>
              {t(
                'Channel groups decide which channel pool a request uses and its base ratio.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                      <FormLabel>
                        {t('Maximum custom groups per token')}
                      </FormLabel>
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
          </CardContent>
        </Card>
      </Form>

      <Card className={sectionCardClassName}>
        <CardHeader className={sectionHeaderClassName}>
          <CardTitle>{t('User group pricing')}</CardTitle>
          <CardDescription>
            {t(
              'A user group decides which channel groups a user can see and at what ratio.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserGroupPricingPanel />
        </CardContent>
      </Card>
    </div>
  )
})
