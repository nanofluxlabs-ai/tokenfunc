import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, ShieldCheck, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { CopyButton } from '@/components/copy-button'
import { DateTimePicker } from '@/components/datetime-picker'
import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { MultiSelect } from '@/components/multi-select'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import {
  ApiKeyGroupCombobox,
  type ApiKeyGroupOption,
} from '@/features/keys/components/api-key-group-combobox'
import { useStatus } from '@/hooks/use-status'
import { getCurrencyLabel } from '@/lib/currency'
import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import {
  requireServerSuccess,
  translateServerText,
} from '@/lib/server-error-message'

import {
  createEnterpriseToken,
  fetchEnterpriseTokenKey,
  getEnterpriseTokenOptions,
  updateEnterpriseToken,
} from '../api'
import { useEnterpriseSelf } from '../hooks/use-enterprise-self'
import { useTeamOptions } from '../hooks/use-team-options'
import { buildKeyHandoverText } from '../lib/key-handover'
import { isTeamScoped } from '../lib/member-roles'
import {
  DEFAULT_TOKEN_QUOTA_POLICY_DRAFT,
  tokenQuotaPolicyDraftShape,
  tokenQuotaPolicyIssues,
  toTokenQuotaPolicyPayload,
  type TokenQuotaPolicyDraft,
} from '../lib/token-quota-policy'
import type { EnterpriseToken, Member, TokenMutatePayload } from '../types'
import { EntitySelect } from './entity-select'
import { MemberPicker } from './member-picker'
import { TokenQuotaPolicyFields } from './token-quota-policy-fields'

/** 额度模式：不限 / 固定额度 / 周期限额（周期限额写入即施行，剩余额度立刻等于周期额度） */
type QuotaMode = 'unlimited' | 'fixed' | 'periodic'
const QUOTA_MODES: { value: QuotaMode; labelKey: string; descKey: string }[] = [
  {
    value: 'unlimited',
    labelKey: 'Unlimited Quota',
    descKey: 'Spending is still limited by the enterprise balance or credit.',
  },
  {
    value: 'fixed',
    labelKey: 'Fixed quota',
    descKey: 'A one-off amount. Raise it manually when it runs out.',
  },
  {
    value: 'periodic',
    labelKey: 'Periodic quota',
    descKey:
      'Restored to the period amount every day, week, month or custom interval.',
  },
]

/** 从列表行推断额度模式与周期草稿 */
function quotaModeOf(token?: EnterpriseToken): {
  mode: QuotaMode
  draft: TokenQuotaPolicyDraft
} {
  if (token?.reset_period && token.reset_period !== 'never') {
    return {
      mode: 'periodic',
      draft: {
        reset_period: token.reset_period,
        custom_hours: DEFAULT_TOKEN_QUOTA_POLICY_DRAFT.custom_hours,
        period_quota_dollars: quotaUnitsToDollars(token.period_quota),
      },
    }
  }
  return {
    mode: !token || token.unlimited_quota ? 'unlimited' : 'fixed',
    draft: DEFAULT_TOKEN_QUOTA_POLICY_DRAFT,
  }
}

export type TokenMutateSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 编辑的 key；为空表示新建 */
  token?: EnterpriseToken
  /** 从成员行「发放密钥」进入：固定持有人与团队 */
  member?: Member
  /** 从密钥页进入时的默认团队（筛选中的团队） */
  defaultTeamId?: number
  onSaved: () => void
}

type ExpiryPreset = {
  labelKey: string
  months: number
  days: number
  hours: number
}
const EXPIRY_PRESETS: ExpiryPreset[] = [
  { labelKey: 'Never', months: 0, days: 0, hours: 0 },
  { labelKey: '1 Month', months: 1, days: 0, hours: 0 },
  { labelKey: '1 Day', months: 0, days: 1, hours: 0 },
  { labelKey: '1 Hour', months: 0, days: 0, hours: 1 },
]

/**
 * 企业 key 的新建 / 编辑抽屉（四段：基本、额度、访问限制、成功态）。
 * 底层字段与上游 /keys 的抽屉一致，只多了团队 / 持有人归属。
 */
export function TokenMutateSheet(props: TokenMutateSheetProps) {
  const { t } = useTranslation()
  const { data: enterprise } = useEnterpriseSelf()
  const actor = enterprise?.actor
  const teamScoped = isTeamScoped(actor)
  const teamOptions = useTeamOptions()
  const { status: siteStatus } = useStatus()
  const isUpdate = Boolean(props.token)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  const options = useQuery({
    queryKey: ['enterprise', 'token-options'],
    queryFn: async () =>
      requireServerSuccess(await getEnterpriseTokenOptions()).data ?? null,
    enabled: props.open,
    staleTime: 30 * 1000,
  })

  const schema = useMemo(
    () =>
      z
        .object({
          name: z
            .string()
            .trim()
            .min(1, t('Key name is required'))
            .max(50, t('Name must be at most 50 characters')),
          team_id: z.number().int().min(0),
          member_id: z.number().int().min(0),
          quota_mode: z.enum(['unlimited', 'fixed', 'periodic']),
          quota_dollars: z.number().min(0, t('Quota cannot be negative')),
          quota_policy: tokenQuotaPolicyDraftShape,
          expired_time: z.date().optional(),
          group: z.string(),
          model_limits: z.array(z.string()),
          allow_ips: z.string(),
        })
        .superRefine((values, ctx) => {
          // 只有周期模式才校验周期字段
          if (values.quota_mode !== 'periodic') return
          for (const issue of tokenQuotaPolicyIssues(values.quota_policy, t)) {
            ctx.addIssue({
              code: 'custom',
              path: ['quota_policy', issue.path],
              message: issue.message,
            })
          }
        }),
    [t]
  )
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      team_id: 0,
      member_id: 0,
      quota_mode: 'unlimited',
      quota_dollars: 0,
      quota_policy: DEFAULT_TOKEN_QUOTA_POLICY_DRAFT,
      expired_time: undefined,
      group: '',
      model_limits: [],
      allow_ips: '',
    },
  })
  const quotaMode = useWatch({ control: form.control, name: 'quota_mode' })
  const teamId = useWatch({ control: form.control, name: 'team_id' })
  const group = useWatch({ control: form.control, name: 'group' })

  // 只依赖团队 id 而不是 actor 对象，避免查询结果对象变化时反复 reset
  const actorTeamId = actor?.team_id ?? 0
  useEffect(() => {
    if (!props.open) return
    setCreatedKey(null)
    const token = props.token
    const quota = quotaModeOf(token)
    form.reset({
      name: token?.name ?? props.member?.name ?? '',
      team_id:
        token?.team_id ??
        props.member?.team_id ??
        props.defaultTeamId ??
        actorTeamId,
      member_id: token?.member_id ?? props.member?.id ?? 0,
      quota_mode: quota.mode,
      quota_dollars:
        quota.mode === 'fixed'
          ? quotaUnitsToDollars(token?.remain_quota ?? 0)
          : 0,
      quota_policy: quota.draft,
      expired_time:
        token && token.expired_time > 0
          ? new Date(token.expired_time * 1000)
          : undefined,
      group: token?.group ?? '',
      model_limits: token?.model_limits
        ? token.model_limits.split(',').filter(Boolean)
        : [],
      allow_ips: token?.allow_ips ?? '',
    })
  }, [
    props.open,
    props.token,
    props.member,
    props.defaultTeamId,
    actorTeamId,
    form,
  ])

  const groupOptions = useMemo<ApiKeyGroupOption[]>(
    () =>
      (options.data?.groups ?? []).map((item) => ({
        value: item.value,
        label: item.value,
        desc: item.desc ? translateServerText(t, item.desc) : item.value,
        ratio: item.ratio,
      })),
    [options.data, t]
  )
  const modelOptions = useMemo(
    () =>
      (options.data?.models_by_group[group] ?? []).map((name) => ({
        label: name,
        value: name,
      })),
    [options.data, group]
  )

  const setExpiry = (preset: ExpiryPreset) => {
    if (preset.months === 0 && preset.days === 0 && preset.hours === 0) {
      form.setValue('expired_time', undefined)
      return
    }
    const next = new Date()
    next.setMonth(next.getMonth() + preset.months)
    next.setDate(next.getDate() + preset.days)
    next.setHours(next.getHours() + preset.hours)
    form.setValue('expired_time', next)
  }

  const onSubmit = async (values: Values) => {
    setIsSubmitting(true)
    try {
      // 周期模式：剩余额度就是周期额度；其它模式显式传 never 以清掉旧策略
      const quotaPolicy =
        values.quota_mode === 'periodic'
          ? toTokenQuotaPolicyPayload(
              values.quota_policy,
              parseQuotaFromDollars
            )
          : toTokenQuotaPolicyPayload(
              { ...values.quota_policy, reset_period: 'never' },
              parseQuotaFromDollars
            )
      let remainQuota = 0
      if (values.quota_mode === 'fixed') {
        remainQuota = parseQuotaFromDollars(values.quota_dollars)
      } else if (values.quota_mode === 'periodic') {
        remainQuota = quotaPolicy.period_quota
      }
      const payload: TokenMutatePayload = {
        name: values.name,
        team_id: values.team_id,
        member_id: values.member_id,
        unlimited_quota: values.quota_mode === 'unlimited',
        remain_quota: remainQuota,
        quota_policy: quotaPolicy,
        expired_time: values.expired_time
          ? Math.floor(values.expired_time.getTime() / 1000)
          : -1,
        group: values.group,
        model_limits: values.model_limits,
        allow_ips: values.allow_ips,
      }
      if (props.token) {
        const result = await updateEnterpriseToken(props.token.id, payload)
        if (!result.success) {
          handleServerError(result)
          return
        }
        toast.success(t('API Key updated'))
        props.onSaved()
        props.onOpenChange(false)
        return
      }
      const result = await createEnterpriseToken(payload)
      if (!result.success || !result.data) {
        handleServerError(result)
        return
      }
      props.onSaved()
      const keyResult = await fetchEnterpriseTokenKey(result.data.id)
      if (keyResult.success && keyResult.data) {
        setCreatedKey(`sk-${keyResult.data.key}`)
      } else {
        props.onOpenChange(false)
      }
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const baseUrl =
    (siteStatus?.server_address as string | undefined) ||
    (typeof window === 'undefined' ? '' : window.location.origin)
  const handoverText = createdKey
    ? buildKeyHandoverText({
        memberName: props.member?.name,
        baseUrl,
        key: createdKey,
        docsUrl: `${baseUrl}/docs/enterprise-integration`,
      })
    : ''

  let submitLabel = isUpdate ? t('Save changes') : t('Create')
  if (isSubmitting) submitLabel = t('Saving...')
  let title = t('Create API Key')
  if (props.token) {
    title = t('Edit API Key')
  } else if (props.member) {
    title = t('Issue API Key to {{name}}', { name: props.member.name })
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[620px]')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{createdKey ? t('API Key Created') : title}</SheetTitle>
          <SheetDescription>
            {createdKey
              ? t(
                  'Copy the key and hand it to the member through a secure channel.'
                )
              : t(
                  'Usage of this key is billed to the enterprise and attributed to the selected team and holder.'
                )}
          </SheetDescription>
        </SheetHeader>
        {createdKey ? (
          <div className={sideDrawerFormClassName('gap-4')}>
            <div className='bg-muted flex items-center gap-2 rounded-md p-3'>
              <code
                className='min-w-0 flex-1 font-mono text-sm break-all'
                data-testid='created-key'
              >
                {createdKey}
              </code>
              <CopyButton value={createdKey} aria-label={t('Copy API key')} />
            </div>
            <div className='bg-muted rounded-md p-3'>
              <div className='mb-2 flex items-center justify-between'>
                <span className='text-sm font-medium'>
                  {t('Handover text')}
                </span>
                <CopyButton
                  value={handoverText}
                  aria-label={t('Copy handover text')}
                />
              </div>
              <pre className='text-muted-foreground font-mono text-xs whitespace-pre-wrap'>
                {handoverText}
              </pre>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form
              id='enterprise-token-form'
              className={sideDrawerFormClassName('gap-5')}
              onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
            >
              <SideDrawerSection>
                <SideDrawerSectionHeader
                  title={t('Basic Information')}
                  icon={<KeyRound className='size-4' />}
                  iconTone='info'
                />
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
                {!props.member && !teamScoped && (
                  <FormField
                    control={form.control}
                    name='team_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Team')}</FormLabel>
                        <EntitySelect
                          value={field.value}
                          onChange={(value) => {
                            field.onChange(value)
                            // 换团队后持有人要重选（持有人必须属于该团队）
                            form.setValue('member_id', 0)
                          }}
                          options={teamOptions}
                          noneLabel={t('Default team')}
                          aria-label={t('Team')}
                        />
                      </FormItem>
                    )}
                  />
                )}
                {!props.member && (
                  <FormField
                    control={form.control}
                    name='member_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Holder')}</FormLabel>
                        <MemberPicker
                          value={field.value}
                          onChange={field.onChange}
                          teamId={teamId}
                          selectedLabel={
                            field.value === props.token?.member_id
                              ? props.token?.member_name
                              : undefined
                          }
                          noneLabel={t('Team key (no holder)')}
                          aria-label={t('Holder')}
                        />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name='expired_time'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Expiration Time')}</FormLabel>
                      <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
                        <FormControl>
                          <DateTimePicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t('Never expires')}
                            className='min-w-0'
                          />
                        </FormControl>
                        <div className='grid grid-cols-4 gap-2 sm:flex'>
                          {EXPIRY_PRESETS.map((preset) => (
                            <Button
                              key={preset.labelKey}
                              type='button'
                              variant='outline'
                              size='sm'
                              className='px-2 text-xs sm:px-3 sm:text-sm'
                              onClick={() => setExpiry(preset)}
                            >
                              {t(preset.labelKey)}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SideDrawerSection>

              <SideDrawerSection>
                <SideDrawerSectionHeader
                  title={t('Quota Settings')}
                  icon={<WalletCards className='size-4' />}
                  iconTone='success'
                />
                <FormField
                  control={form.control}
                  name='quota_mode'
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={(value) =>
                            field.onChange(value as QuotaMode)
                          }
                          aria-label={t('Quota Settings')}
                          className='flex flex-col gap-2'
                        >
                          {QUOTA_MODES.map((mode) => (
                            <label
                              key={mode.value}
                              className='flex items-start gap-2 text-sm'
                            >
                              <RadioGroupItem
                                value={mode.value}
                                id={`token-quota-mode-${mode.value}`}
                              />
                              <span>
                                <span className='font-medium'>
                                  {t(mode.labelKey)}
                                </span>
                                <span className='text-muted-foreground block text-xs'>
                                  {t(mode.descKey)}
                                </span>
                              </span>
                            </label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
                {quotaMode === 'fixed' && (
                  <FormField
                    control={form.control}
                    name='quota_dollars'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('Quota ({{currency}})', {
                            currency: getCurrencyLabel(),
                          })}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            min={0}
                            step='0.01'
                            value={field.value}
                            onChange={(event) =>
                              field.onChange(
                                Number.parseFloat(event.target.value) || 0
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {quotaMode === 'periodic' && (
                  <FormField
                    control={form.control}
                    name='quota_policy'
                    render={({ field }) => (
                      <FormItem>
                        <TokenQuotaPolicyFields
                          idPrefix='token-sheet-quota-policy'
                          value={field.value}
                          onChange={field.onChange}
                          errors={{
                            period_quota_dollars:
                              form.formState.errors.quota_policy
                                ?.period_quota_dollars?.message,
                            custom_hours:
                              form.formState.errors.quota_policy?.custom_hours
                                ?.message,
                          }}
                        />
                      </FormItem>
                    )}
                  />
                )}
              </SideDrawerSection>

              <SideDrawerSection>
                <SideDrawerSectionHeader
                  title={t('Access Restrictions')}
                  description={t(
                    'Group, model allowlist and IP whitelist. Leave empty for no restriction.'
                  )}
                  icon={<ShieldCheck className='size-4' />}
                />
                <FormField
                  control={form.control}
                  name='group'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Group')}</FormLabel>
                      <FormControl>
                        <ApiKeyGroupCombobox
                          options={[
                            {
                              value: '',
                              label: t('Follow enterprise group'),
                              desc: options.data?.owner_group,
                            },
                            ...groupOptions,
                          ]}
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value)
                            // 分组变了，模型白名单按新分组重选
                            form.setValue('model_limits', [])
                          }}
                          placeholder={t('Follow enterprise group')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='model_limits'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Model Limits')}</FormLabel>
                      <FormControl>
                        <MultiSelect
                          options={modelOptions}
                          selected={field.value}
                          onChange={field.onChange}
                          placeholder={t('Select models (empty for allow all)')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='allow_ips'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('IP Whitelist (supports CIDR)')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className='min-h-20 resize-none'
                          placeholder={t(
                            'One IP per line (empty for no restriction)'
                          )}
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SideDrawerSection>
            </form>
          </Form>
        )}
        <SheetFooter className={sideDrawerFooterClassName()}>
          {createdKey ? (
            <Button
              className='w-full sm:w-auto'
              onClick={() => props.onOpenChange(false)}
            >
              {t('Done')}
            </Button>
          ) : (
            <>
              <SheetClose
                render={
                  <Button variant='outline' className='w-full sm:w-auto' />
                }
              >
                {t('Close')}
              </SheetClose>
              <Button
                type='submit'
                form='enterprise-token-form'
                disabled={isSubmitting}
                className='w-full sm:w-auto'
              >
                {submitLabel}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
