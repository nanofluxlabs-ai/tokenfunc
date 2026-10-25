import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
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
import { Textarea } from '@/components/ui/textarea'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import type { Bill } from '@/features/enterprise-console/types'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { requireServerSuccess } from '@/lib/server-error-message'

import { createEnterpriseAdjustment, getEnterprise } from '../api'

/** 单笔调账金额绝对值上限（USD），与后端一致 */
const MAX_ADJUSTMENT_USD = 1e9
const MIN_REMARK_CHARS = 4
const MAX_REMARK_CHARS = 1000

type AdjustmentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  enterpriseId: number
  /** 账单调账时传入目标账单；不传即余额调账 */
  bill?: Bill | null
  /** 余额调账时用于展示当前余额（quota） */
  balanceQuota?: number
  onSaved: () => void
}

/**
 * 管理员人工调账：预付企业余额或未结清的授信账单。
 * 金额可负、备注必填；提交前先做绑定企业主账号的二次验证，再带 proof 调接口。
 * 二次验证对话框由本组件自行挂载：账单页渲染在财务中心，不在 EnterprisesProvider 之内。
 */
export function AdjustmentDialog(props: AdjustmentDialogProps) {
  const { t } = useTranslation()
  const verification = useSecureVerification()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const kind = props.bill ? 'bill' : 'wallet'
  const total = props.bill ? Number.parseFloat(props.bill.total_usd) : 0
  const paid = props.bill ? Number.parseFloat(props.bill.paid_usd) : 0

  const enterprise = useQuery({
    queryKey: ['admin-enterprise', props.enterpriseId],
    queryFn: async () =>
      requireServerSuccess(await getEnterprise(props.enterpriseId)).data ??
      null,
    enabled: props.open && props.enterpriseId > 0,
  })

  const schema = useMemo(
    () =>
      z.object({
        amount_usd: z
          .number()
          .refine((value) => value !== 0, t('Adjustment amount cannot be zero'))
          .refine(
            (value) => Math.abs(value) <= MAX_ADJUSTMENT_USD,
            t('Adjustment amount is out of range')
          )
          .refine(
            (value) => kind === 'wallet' || total + value >= Math.max(paid, 0),
            t('Adjusted total cannot be below the amount already paid')
          ),
        remark: z
          .string()
          .trim()
          .refine(
            (value) => [...value].length >= MIN_REMARK_CHARS,
            t('Remark must be at least {{count}} characters', {
              count: MIN_REMARK_CHARS,
            })
          )
          .refine(
            (value) => [...value].length <= MAX_REMARK_CHARS,
            t('Remark must be at most {{count}} characters', {
              count: MAX_REMARK_CHARS,
            })
          ),
      }),
    [t, kind, total, paid]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount_usd: 0, remark: '' },
  })
  // 金额输入框保留原始文本：受控成数字会在输入「-」的瞬间被重置成 0，负数就打不出来
  const [amountText, setAmountText] = useState('0')
  const amount = form.watch('amount_usd')

  useEffect(() => {
    if (props.open) {
      form.reset({ amount_usd: 0, remark: '' })
      setAmountText('0')
    }
  }, [props.open, props.bill, form])

  const onSubmit = async (values: Values) => {
    const target = enterprise.data
    if (!target) return
    setIsSubmitting(true)
    try {
      const proof = await verification.requestVerification({
        scope: 'admin.user.manage',
        context: { user_id: target.user_id, action: 'enterprise_adjust' },
        title: t('Verify to adjust enterprise billing'),
        description: t('Confirm your identity before adjusting {{name}}.', {
          name: target.name,
        }),
      })
      if (!proof) return
      const result = await createEnterpriseAdjustment(
        props.enterpriseId,
        {
          kind,
          bill_id: props.bill?.id,
          amount_usd: values.amount_usd,
          remark: values.remark,
        },
        proof.proof_token
      )
      if (!result.success) {
        handleServerError(result, t('Failed to register adjustment'))
        return
      }
      toast.success(t('Adjustment registered'))
      props.onOpenChange(false)
      props.onSaved()
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error),
        t('Failed to register adjustment')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const description = props.bill
    ? `${props.bill.bill_no} · ${t('Outstanding')}: ${props.bill.currency} ${(total - paid).toFixed(2)}`
    : t('Current balance: {{amount}}', {
        amount: formatQuotaWithCurrency(props.balanceQuota ?? 0),
      })

  return (
    <>
      <Dialog
        open={props.open && !verification.isActive}
        onOpenChange={props.onOpenChange}
        title={kind === 'bill' ? t('Adjust bill') : t('Adjust balance')}
        description={description}
        contentClassName='sm:max-w-md'
        footer={
          <Button
            type='submit'
            form='enterprise-adjustment-form'
            disabled={isSubmitting || !enterprise.data}
          >
            {isSubmitting ? t('Saving...') : t('Register adjustment')}
          </Button>
        }
      >
        <Form {...form}>
          <form
            id='enterprise-adjustment-form'
            className='flex flex-col gap-4'
            onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
          >
            <FormField
              control={form.control}
              name='amount_usd'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Adjustment amount (USD)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      step='0.01'
                      value={amountText}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        setAmountText(event.target.value)
                        field.onChange(
                          Number.parseFloat(event.target.value) || 0
                        )
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {kind === 'bill'
                      ? t('New total: {{amount}}', {
                          amount: `${props.bill?.currency ?? 'USD'} ${(total + amount).toFixed(2)}`,
                        })
                      : t(
                          'Positive adds to the balance, negative deducts. Every adjustment is written to the ledger with your remark.'
                        )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='remark'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Remark (required)')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder={t('Why this adjustment is made')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </Dialog>
      <SecureVerificationDialog {...verification.dialogProps} />
    </>
  )
}
