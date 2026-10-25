import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { batchSetTokenQuotaPolicy, setTokenQuotaPolicy } from '../api'
import {
  DEFAULT_TOKEN_QUOTA_POLICY_DRAFT,
  toTokenQuotaPolicyPayload,
  tokenQuotaPolicySchema,
  type TokenQuotaPolicyDraft,
} from '../lib/token-quota-policy'
import type { EnterpriseToken } from '../types'
import { TokenQuotaPolicyFields } from './token-quota-policy-fields'

export type TokenQuotaPolicyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 要设置的 key；单把或批量共用 */
  tokenIds: number[]
  /** 单把时预填当前策略 */
  current?: EnterpriseToken
  onSaved: () => void
}

/** 从列表行还原表单草稿：没有策略时按默认（每日） */
function draftFromToken(token?: EnterpriseToken): TokenQuotaPolicyDraft {
  if (!token || !token.reset_period) {
    return DEFAULT_TOKEN_QUOTA_POLICY_DRAFT
  }
  return {
    reset_period: token.reset_period,
    custom_hours: DEFAULT_TOKEN_QUOTA_POLICY_DRAFT.custom_hours,
    period_quota_dollars: quotaUnitsToDollars(token.period_quota),
  }
}

/**
 * 「设置周期限额」对话框：行菜单单把、批量条多把共用。
 * 写入即施行：保存后剩余额度立刻等于周期额度；选「不设周期限额」则删除策略、当前额度转为固定额度。
 */
export function TokenQuotaPolicyDialog(props: TokenQuotaPolicyDialogProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const schema = useMemo(
    () => z.object({ quota_policy: tokenQuotaPolicySchema(t) }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { quota_policy: DEFAULT_TOKEN_QUOTA_POLICY_DRAFT },
  })

  // 只依赖 open 与当前 key，避免 props 对象变化时反复 reset
  const open = props.open
  const current = props.current
  useEffect(() => {
    if (!open) return
    form.reset({ quota_policy: draftFromToken(current) })
  }, [open, current, form])

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      const payload = toTokenQuotaPolicyPayload(
        values.quota_policy,
        parseQuotaFromDollars
      )
      const result =
        props.tokenIds.length === 1
          ? await setTokenQuotaPolicy(props.tokenIds[0], payload)
          : await batchSetTokenQuotaPolicy(props.tokenIds, payload)
      if (!result.success) {
        handleServerError(result)
        return
      }
      toast.success(t('Periodic quota saved'))
      props.onOpenChange(false)
      props.onSaved()
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const count = props.tokenIds.length
  const title =
    count === 1
      ? t('Set periodic quota')
      : t('Set periodic quota for {{count}} keys', { count })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      description={t(
        'The remaining quota is set to the period amount immediately and restored at every reset.'
      )}
      contentClassName='sm:max-w-md'
      footer={
        <Button
          type='submit'
          form='token-quota-policy-form'
          disabled={isSubmitting}
        >
          {isSubmitting ? t('Saving...') : t('Save')}
        </Button>
      }
    >
      <Form {...form}>
        <form
          id='token-quota-policy-form'
          className='flex flex-col gap-4'
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <FormField
            control={form.control}
            name='quota_policy'
            render={({ field }) => (
              <FormItem>
                <TokenQuotaPolicyFields
                  idPrefix='token-quota-policy-dialog'
                  value={field.value}
                  onChange={field.onChange}
                  allowNever
                  errors={{
                    period_quota_dollars:
                      form.formState.errors.quota_policy?.period_quota_dollars
                        ?.message,
                    custom_hours:
                      form.formState.errors.quota_policy?.custom_hours?.message,
                  }}
                />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
