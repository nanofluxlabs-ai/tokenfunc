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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { createEmployee, updateEmployee } from '../api'
import { flattenDepartmentTree } from '../lib/department-tree'
import type { DepartmentNode, Employee } from '../types'
import { EntitySelect } from './entity-select'

type EmployeeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tree: DepartmentNode[]
  employee?: Employee
  defaultDepartmentId?: number
  onSaved: () => void
}

export function EmployeeDialog(props: EmployeeDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('Employee name is required'))
          .max(64, t('Name must be at most 64 characters')),
        email: z.union([
          z.literal(''),
          z.string().trim().email(t('Invalid email address')),
        ]),
        employee_no: z.string().trim().max(64),
        department_id: z.number().int().min(0),
        active: z.boolean(),
        remark: z.string(),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      employee_no: '',
      department_id: 0,
      active: true,
      remark: '',
    },
  })

  useEffect(() => {
    if (!props.open) return
    const employee = props.employee
    form.reset({
      name: employee?.name ?? '',
      email: employee?.email ?? '',
      employee_no: employee?.employee_no ?? '',
      department_id: employee?.department_id ?? props.defaultDepartmentId ?? 0,
      active: employee ? employee.status === 'active' : true,
      remark: employee?.remark ?? '',
    })
  }, [props.open, props.employee, props.defaultDepartmentId, form])

  const departmentOptions = useMemo(
    () =>
      flattenDepartmentTree(props.tree).map((node) => ({
        value: node.id,
        label: `${'— '.repeat(node.depth)}${node.name}`,
      })),
    [props.tree]
  )

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const payload = {
        name: values.name,
        email: values.email,
        employee_no: values.employee_no,
        department_id: values.department_id,
        status: values.active ? ('active' as const) : ('disabled' as const),
        remark: values.remark,
      }
      const result = props.employee
        ? await updateEmployee(props.employee.id, payload)
        : await createEmployee(payload)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Employee saved'))
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
      title={props.employee ? t('Edit Employee') : t('Add Employee')}
      description={t(
        'Employees do not sign in. They call the API with the keys you assign to them.'
      )}
      contentClassName='sm:max-w-lg'
      footer={
        <Button type='submit' form='employee-form' disabled={isSubmitting}>
          {isSubmitting ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='employee-form'
          className='flex flex-col gap-4'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Email')}</FormLabel>
                  <FormControl>
                    <Input {...field} type='email' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='employee_no'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Employee No.')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name='department_id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Department')}</FormLabel>
                <EntitySelect
                  value={field.value}
                  onChange={field.onChange}
                  options={departmentOptions}
                  noneLabel={t('Unassigned')}
                  aria-label={t('Department')}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          {props.employee && (
            <FormField
              control={form.control}
              name='active'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between gap-4'>
                  <div>
                    <FormLabel>{t('Active')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Disabling an employee also disables all of their API keys.'
                      )}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name='remark'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Remark')}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
