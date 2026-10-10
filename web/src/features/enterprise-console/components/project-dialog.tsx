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

import { createProject, updateProject } from '../api'
import type { Project } from '../types'

type ProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project
  onSaved: () => void
}

export function ProjectDialog(props: ProjectDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('Project name is required'))
          .max(64, t('Name must be at most 64 characters')),
        code: z.string().trim().max(64),
        archived: z.boolean(),
        remark: z.string(),
      }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '', archived: false, remark: '' },
  })

  useEffect(() => {
    if (!props.open) return
    form.reset({
      name: props.project?.name ?? '',
      code: props.project?.code ?? '',
      archived: props.project?.status === 'archived',
      remark: props.project?.remark ?? '',
    })
  }, [props.open, props.project, form])

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const payload = {
        name: values.name,
        code: values.code,
        status: values.archived ? ('archived' as const) : ('active' as const),
        remark: values.remark,
      }
      const result = props.project
        ? await updateProject(props.project.id, payload)
        : await createProject(payload)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Project saved'))
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
      title={props.project ? t('Edit Project') : t('Add Project')}
      description={t(
        'Projects are used to attribute API usage. They do not limit spending.'
      )}
      contentClassName='sm:max-w-lg'
      footer={
        <Button type='submit' form='project-form' disabled={isSubmitting}>
          {isSubmitting ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='project-form'
          className='flex flex-col gap-4'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Project Name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='code'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Project Code')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {props.project && (
            <FormField
              control={form.control}
              name='archived'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between gap-4'>
                  <div>
                    <FormLabel>{t('Archived')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Archived projects cannot be assigned to new API keys.'
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
