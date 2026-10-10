import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { handleServerError } from '@/lib/handle-server-error'

import { createDepartment, updateDepartment } from '../api'
import {
  collectDescendantIds,
  flattenDepartmentTree,
} from '../lib/department-tree'
import type { Department, DepartmentNode } from '../types'
import { EntitySelect } from './entity-select'

type DepartmentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: DepartmentNode[]
  /** 编辑的部门；为空表示新建 */
  department?: Department
  /** 新建时的默认上级部门 */
  defaultParentId?: number
  onSaved: () => void
}

export function DepartmentDialog(props: DepartmentDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('Department name is required'))
          .max(64, t('Name must be at most 64 characters')),
        parent_id: z.number().int().min(0),
        sort: z.number().int(),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', parent_id: 0, sort: 0 },
  })

  useEffect(() => {
    if (!props.open) return
    form.reset({
      name: props.department?.name ?? '',
      parent_id: props.department?.parent_id ?? props.defaultParentId ?? 0,
      sort: props.department?.sort ?? 0,
    })
  }, [props.open, props.department, props.defaultParentId, form])

  // 编辑时不能选择自己或自己的子孙作为上级
  const parentOptions = useMemo(() => {
    const excluded = props.department
      ? collectDescendantIds(props.tree, props.department.id)
      : new Set<number>()
    return flattenDepartmentTree(props.tree)
      .filter((node) => !excluded.has(node.id))
      .map((node) => ({
        value: node.id,
        label: `${'— '.repeat(node.depth)}${node.name}`,
      }))
  }, [props.tree, props.department])

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const result = props.department
        ? await updateDepartment(props.department.id, values)
        : await createDepartment(values)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Department saved'))
      props.onOpenChange(false)
      props.onSaved()
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.department ? t('Edit Department') : t('Add Department')}
      contentClassName='sm:max-w-md'
      footer={
        <Button type='submit' form='department-form' disabled={isSubmitting}>
          {isSubmitting ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='department-form'
          className='flex flex-col gap-4'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Department Name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='parent_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Parent Department')}</FormLabel>
                <EntitySelect
                  value={field.value}
                  onChange={field.onChange}
                  options={parentOptions}
                  noneLabel={t('None (top level)')}
                  aria-label={t('Parent Department')}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
