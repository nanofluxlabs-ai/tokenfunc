import * as z from 'zod'

export const TRIAL_LEAD_VOLUMES = ['lt_1k', '1k_10k', 'gt_10k'] as const

/**
 * 与服务端 CreateEnterpriseTrialLead 的校验保持一致；
 * 文案由组件传入，便于 i18n（zod 的默认提示不走 t()）。
 */
export function createTrialLeadSchema(messages: {
  companyRequired: string
  contactRequired: string
}) {
  return z.object({
    company: z
      .string()
      .trim()
      .min(1, { error: () => messages.companyRequired })
      .max(128),
    contact: z
      .string()
      .trim()
      .min(5, { error: () => messages.contactRequired })
      .max(128),
    volume: z.enum(TRIAL_LEAD_VOLUMES),
  })
}

export type TrialLeadFormValues = z.infer<
  ReturnType<typeof createTrialLeadSchema>
>
