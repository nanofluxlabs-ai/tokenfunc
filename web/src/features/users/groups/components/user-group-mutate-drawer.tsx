// TokenFunc 二开：新增 / 编辑用户分组的抽屉。
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  SideDrawerSection,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'
import {
  createUserGroup,
  tokenFuncGroupQueryKeys,
  updateUserGroup,
  type UserGroupItem,
  type UserGroupKind,
} from '@/lib/tokenfunc-groups'

import {
  USER_GROUP_FORM_DEFAULT_VALUES,
  getUserGroupFormSchema,
  type UserGroupFormValues,
} from '../lib/user-group-form'

type UserGroupMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: UserGroupItem
  /** 新建成功后回调新分组的 key；定价面板用它自动选中新分组 */
  onCreated?: (key: string) => void
}

export function UserGroupMutateDrawer(props: UserGroupMutateDrawerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const currentRow = props.currentRow
  const isUpdate = currentRow !== undefined
  // default 分组是上游的保底分组：名称 / 说明可改，类型固定为个人
  const isDefaultGroup = currentRow?.key === 'default'

  const schema = useMemo(
    () => getUserGroupFormSchema(t, isUpdate),
    [t, isUpdate]
  )
  const form = useForm<UserGroupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: USER_GROUP_FORM_DEFAULT_VALUES,
  })

  useEffect(() => {
    if (!props.open) return
    form.reset(
      currentRow
        ? {
            key: currentRow.key,
            label: currentRow.label,
            kind: currentRow.kind,
            description: currentRow.description,
          }
        : USER_GROUP_FORM_DEFAULT_VALUES
    )
  }, [props.open, currentRow, form])

  const kindOptions: { value: UserGroupKind; label: string }[] = [
    { value: 'individual', label: t('Personal') },
    { value: 'enterprise', label: t('Enterprise') },
  ]

  const onSubmit = async (values: UserGroupFormValues) => {
    setIsSubmitting(true)
    try {
      const payload = {
        label: values.label,
        description: values.description,
        kind: values.kind,
      }
      const result = currentRow
        ? await updateUserGroup(currentRow.key, payload)
        : await createUserGroup({ ...payload, key: values.key })
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(
        currentRow ? t('User group updated') : t('User group created')
      )
      props.onOpenChange(false)
      if (!currentRow) props.onCreated?.(values.key)
      void queryClient.invalidateQueries({
        queryKey: tokenFuncGroupQueryKeys.all,
      })
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[520px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {isUpdate ? t('Edit user group') : t('Create user group')}
          </SheetTitle>
          <SheetDescription>
            {t(
              'A user group decides which channel groups a user can see and at what ratio.'
            )}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='user-group-form'
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
            className={sideDrawerFormClassName()}
          >
            <SideDrawerSection>
              <FormField
                control={form.control}
                name='key'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Group key')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete='off'
                        spellCheck={false}
                        placeholder='ent_std'
                        readOnly={isUpdate}
                        disabled={isUpdate}
                        className='font-mono'
                      />
                    </FormControl>
                    <FormDescription>
                      {isUpdate
                        ? t('The key cannot be changed after creation.')
                        : t(
                            'Stored on each user; lowercase letters, digits, hyphens and underscores.'
                          )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='label'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Name')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('Enter group name')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='kind'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Type')}</FormLabel>
                    <Select
                      items={kindOptions}
                      value={field.value}
                      onValueChange={(value) =>
                        value !== null && field.onChange(value)
                      }
                      disabled={isDefaultGroup}
                    >
                      <FormControl>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {kindOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t(
                        'Decides which user list the group is offered in: personal users or enterprises.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder={t('Admin notes (only visible to admins)')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SideDrawerSection>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Cancel')}
          </SheetClose>
          <Button form='user-group-form' type='submit' disabled={isSubmitting}>
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
