import type { TFunction } from 'i18next'
import { z } from 'zod'

import { DEFAULT_PAYMENT_TERMS_DAYS, MAX_ENTERPRISE_TOKENS } from '../constants'
import type {
  CreateEnterprisePayload,
  Enterprise,
  EnterpriseProfilePayload,
} from '../types'

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
      user_id: z.string().trim(),
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
    })
    .superRefine((values, ctx) => {
      if (isUpdate) return
      if (values.mode === 'new_user') {
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
      if (!/^[1-9]\d*$/.test(values.user_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['user_id'],
          message: t('Enter a valid user ID'),
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
  user_id: '',
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
}

export function enterpriseToFormValues(
  enterprise: Enterprise
): EnterpriseFormValues {
  const profile = enterprise.billing_profile
  return {
    ...ENTERPRISE_FORM_DEFAULT_VALUES,
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

export function formValuesToCreatePayload(
  values: EnterpriseFormValues
): CreateEnterprisePayload {
  const enterprise = formValuesToProfilePayload(values)
  if (values.mode === 'upgrade') {
    return { mode: 'upgrade', user_id: Number(values.user_id), enterprise }
  }
  return {
    mode: 'new_user',
    username: values.username,
    password: values.password,
    display_name: values.display_name,
    enterprise,
  }
}
