import type { TFunction } from 'i18next'
import { z } from 'zod'

import { DEFAULT_PAYMENT_TERMS_DAYS, MAX_ENTERPRISE_TOKENS } from '../constants'
import type {
  CreateEnterprisePayload,
  CreditCycleType,
  Enterprise,
  EnterpriseProfilePayload,
  UpdateEnterprisePayload,
} from '../types'

const CREDIT_CYCLE_TYPES: CreditCycleType[] = [
  'natural_month',
  'fixed_days',
  'quota_based',
]

/** 与后端 EnterpriseDefaultCreditAlertPercent 一致 */
const DEFAULT_CREDIT_ALERT_PERCENT = 80
const DEFAULT_CREDIT_CYCLE_DAYS = 30

/** 新建账号的默认分组；升级已有用户默认取该用户当前分组 */
export const DEFAULT_ENTERPRISE_GROUP = 'default'

/** 企业资料折叠区包含的字段：校验失败时据此展开分区 */
export const ENTERPRISE_PROFILE_FIELDS = [
  'name',
  'contact_name',
  'contact_email',
  'contact_phone',
  'payment_terms_days',
  'max_tokens',
] as const

/** 开票资料折叠区包含的字段 */
export const BILLING_PROFILE_FIELDS = [
  'company_name',
  'tax_id',
  'address',
  'country',
  'billing_email',
  'phone',
] as const

export function getEnterpriseFormSchema(t: TFunction, isUpdate: boolean) {
  return z
    .object({
      mode: z.enum(['new_user', 'upgrade']),
      username: z
        .string()
        .trim()
        .max(20, t('Username must be at most 20 characters')),
      password: z.string(),
      display_name: z
        .string()
        .trim()
        .max(20, t('Display name must be at most 20 characters')),
      email: z.string().trim(),
      // 升级模式选中的已有用户；group 是其当前分组，用于判断提交时要不要改分组
      upgrade_user: z
        .object({
          id: z.number(),
          username: z.string(),
          display_name: z.string(),
          role: z.number(),
          group: z.string().optional(),
        })
        .nullable(),
      group: z.string().trim(),
      name: z
        .string()
        .trim()
        .min(1, t('Enterprise name is required'))
        .max(128, t('Enterprise name must be at most 128 characters')),
      contact_name: z.string().trim().max(64),
      contact_email: z.union([
        z.literal(''),
        z.string().trim().email(t('Invalid email address')),
      ]),
      contact_phone: z.string().trim().max(32),
      payment_terms_days: z
        .number()
        .int()
        .min(1, t('Payment terms must be between 1 and 365 days'))
        .max(365, t('Payment terms must be between 1 and 365 days')),
      max_tokens: z
        .number()
        .int()
        .min(0, t('Max API keys must be between 0 and 10000'))
        .max(
          MAX_ENTERPRISE_TOKENS,
          t('Max API keys must be between 0 and 10000')
        ),
      company_name: z.string().trim(),
      tax_id: z.string().trim(),
      address: z.string().trim(),
      billing_email: z.union([
        z.literal(''),
        z.string().trim().email(t('Invalid email address')),
      ]),
      phone: z.string().trim(),
      country: z.string().trim(),
      remark: z.string(),
      billing_mode: z.enum(['prepaid', 'credit']),
      // 范围校验放在 superRefine：选预付时授信字段是隐藏的，不能拦住提交
      credit: z.object({
        cycle_type: z.enum(CREDIT_CYCLE_TYPES),
        cycle_days: z.number(),
        // 输入框清空时为 NaN，在 superRefine 里报「请填写」，而不是被当成 0 提交
        limit_usd: z.number().or(z.nan()),
        alert_percent: z.number(),
        auto_reset: z.boolean(),
      }),
    })
    .superRefine((values, ctx) => {
      if (!values.group) {
        ctx.addIssue({
          code: 'custom',
          path: ['group'],
          message: t('Group is required'),
        })
      }
      if (values.billing_mode === 'credit') {
        const credit = values.credit
        if (
          credit.cycle_type === 'fixed_days' &&
          (!Number.isInteger(credit.cycle_days) ||
            credit.cycle_days < 1 ||
            credit.cycle_days > 366)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['credit', 'cycle_days'],
            message: t('Cycle length must be between 1 and 366 days'),
          })
        }
        if (Number.isNaN(credit.limit_usd)) {
          ctx.addIssue({
            code: 'custom',
            path: ['credit', 'limit_usd'],
            message: t('Enter the credit limit per period'),
          })
        } else if (credit.limit_usd <= 0) {
          // 额度为 0 时开通即全部拒绝（额度信用更会首次请求就翻转），后端同样拒绝
          ctx.addIssue({
            code: 'custom',
            path: ['credit', 'limit_usd'],
            message: t('Credit limit must be greater than 0'),
          })
        }
        if (
          !Number.isInteger(credit.alert_percent) ||
          credit.alert_percent < 0 ||
          credit.alert_percent > 99
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['credit', 'alert_percent'],
            message: t('Alert threshold must be between 0 and 99'),
          })
        }
      }
      if (isUpdate) return
      if (values.mode === 'new_user') {
        if (values.email && !z.email().safeParse(values.email).success) {
          ctx.addIssue({
            code: 'custom',
            path: ['email'],
            message: t('Invalid email address'),
          })
        }
        if (!values.username) {
          ctx.addIssue({
            code: 'custom',
            path: ['username'],
            message: t('Username is required'),
          })
        }
        if (values.password.length < 8 || values.password.length > 128) {
          ctx.addIssue({
            code: 'custom',
            path: ['password'],
            message: t('Password must be 8-128 characters'),
          })
        }
        return
      }
      if (!values.upgrade_user) {
        ctx.addIssue({
          code: 'custom',
          path: ['upgrade_user'],
          message: t('Select the user to upgrade'),
        })
      }
    })
}

export type EnterpriseFormValues = z.infer<
  ReturnType<typeof getEnterpriseFormSchema>
>

export const ENTERPRISE_FORM_DEFAULT_VALUES: EnterpriseFormValues = {
  mode: 'new_user',
  username: '',
  password: '',
  display_name: '',
  email: '',
  upgrade_user: null,
  group: DEFAULT_ENTERPRISE_GROUP,
  name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  payment_terms_days: DEFAULT_PAYMENT_TERMS_DAYS,
  max_tokens: 0,
  company_name: '',
  tax_id: '',
  address: '',
  billing_email: '',
  phone: '',
  country: '',
  remark: '',
  billing_mode: 'prepaid',
  credit: {
    cycle_type: 'natural_month',
    cycle_days: DEFAULT_CREDIT_CYCLE_DAYS,
    limit_usd: 0,
    alert_percent: DEFAULT_CREDIT_ALERT_PERCENT,
    auto_reset: false,
  },
}

/** quotaPerUnit 把授信额度从 quota 换成表单里的 USD */
export function enterpriseToFormValues(
  enterprise: Enterprise,
  quotaPerUnit: number
): EnterpriseFormValues {
  const profile = enterprise.billing_profile
  const isCredit = enterprise.billing_mode === 'credit'
  const cycleType = CREDIT_CYCLE_TYPES.find(
    (type) => type === enterprise.credit_cycle_type
  )
  return {
    ...ENTERPRISE_FORM_DEFAULT_VALUES,
    group: enterprise.owner_group ?? '',
    name: enterprise.name,
    contact_name: enterprise.contact_name,
    contact_email: enterprise.contact_email,
    contact_phone: enterprise.contact_phone,
    payment_terms_days:
      enterprise.payment_terms_days || DEFAULT_PAYMENT_TERMS_DAYS,
    max_tokens: enterprise.max_tokens ?? 0,
    company_name: profile?.company_name ?? '',
    tax_id: profile?.tax_id ?? '',
    address: profile?.address ?? '',
    billing_email: profile?.billing_email ?? '',
    phone: profile?.phone ?? '',
    country: profile?.country ?? '',
    remark: enterprise.remark ?? '',
    billing_mode: isCredit ? 'credit' : 'prepaid',
    credit: {
      cycle_type: cycleType ?? 'natural_month',
      cycle_days: enterprise.credit_cycle_days || DEFAULT_CREDIT_CYCLE_DAYS,
      limit_usd: enterprise.credit_limit_quota / quotaPerUnit,
      // 尚未开通授信的企业沿用默认阈值；已开通的保留当前值（含 0 = 关闭）
      alert_percent: isCredit
        ? enterprise.credit_alert_percent
        : DEFAULT_CREDIT_ALERT_PERCENT,
      auto_reset: enterprise.credit_auto_reset,
    },
  }
}

export function formValuesToProfilePayload(
  values: EnterpriseFormValues
): EnterpriseProfilePayload {
  return {
    name: values.name,
    contact_name: values.contact_name,
    contact_email: values.contact_email,
    contact_phone: values.contact_phone,
    payment_terms_days: values.payment_terms_days,
    max_tokens: values.max_tokens,
    billing_profile: {
      company_name: values.company_name,
      tax_id: values.tax_id,
      address: values.address,
      billing_email: values.billing_email,
      phone: values.phone,
      country: values.country,
    },
    remark: values.remark,
  }
}

/** savedGroup 是企业当前分组：分组没变就不传，避免无谓地把企业主账号踢下线 */
export function formValuesToUpdatePayload(
  values: EnterpriseFormValues,
  savedGroup: string
): UpdateEnterprisePayload {
  const payload: UpdateEnterprisePayload = formValuesToProfilePayload(values)
  if (values.group !== savedGroup) payload.group = values.group
  return payload
}

export function formValuesToCreatePayload(
  values: EnterpriseFormValues
): CreateEnterprisePayload {
  const enterprise = formValuesToProfilePayload(values)
  if (values.mode === 'upgrade') {
    // 与该用户当前分组相同就不传，后端保留原分组
    const keepGroup = values.group === values.upgrade_user?.group
    return {
      mode: 'upgrade',
      user_id: values.upgrade_user?.id ?? 0,
      group: keepGroup ? undefined : values.group,
      enterprise,
    }
  }
  return {
    mode: 'new_user',
    username: values.username,
    password: values.password,
    display_name: values.display_name,
    email: values.email || undefined,
    group: values.group,
    enterprise,
  }
}

type CreditChange = 'none' | 'configure' | 'disable'

/**
 * 对比已保存的计费设置与表单，决定保存资料后还要不要调授信接口：
 * 预付 → 授信、授信字段有改动为 configure；授信 → 预付为 disable；其余不动，也就不弹二次验证。
 * 只比较当前周期类型用得到的字段，隐藏字段的残留值不算改动。
 */
export function resolveCreditChange(
  saved: EnterpriseFormValues,
  values: EnterpriseFormValues
): CreditChange {
  if (values.billing_mode === 'prepaid') {
    return saved.billing_mode === 'credit' ? 'disable' : 'none'
  }
  if (saved.billing_mode === 'prepaid') return 'configure'
  const before = saved.credit
  const after = values.credit
  const unchanged =
    before.cycle_type === after.cycle_type &&
    before.limit_usd === after.limit_usd &&
    before.alert_percent === after.alert_percent &&
    (after.cycle_type !== 'fixed_days' ||
      before.cycle_days === after.cycle_days) &&
    (after.cycle_type !== 'quota_based' ||
      before.auto_reset === after.auto_reset)
  return unchanged ? 'none' : 'configure'
}
