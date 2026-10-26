import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type FieldErrors, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { PasswordInput } from '@/components/password-input'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import { UserPicker } from '@/components/user-picker'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import { getCurrencyDisplay } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import {
  getServerErrorMessage,
  requireServerSuccess,
} from '@/lib/server-error-message'

import {
  configureEnterpriseCredit,
  createEnterprise,
  disableEnterpriseCredit,
  getEnterprise,
  updateEnterprise,
} from '../api'
import { SUCCESS_MESSAGES } from '../constants'
import {
  BILLING_PROFILE_FIELDS,
  DEFAULT_ENTERPRISE_GROUP,
  ENTERPRISE_FORM_DEFAULT_VALUES,
  ENTERPRISE_PROFILE_FIELDS,
  type EnterpriseFormValues,
  enterpriseToFormValues,
  formValuesToCreatePayload,
  formValuesToUpdatePayload,
  getEnterpriseFormSchema,
  resolveCreditChange,
} from '../lib/enterprise-form'
import type { Enterprise, EnterpriseListItem } from '../types'
import { CreditConfigFields } from './credit-config-fields'
import {
  BillingProfileFields,
  CollapsibleDrawerSection,
  EnterpriseProfileFields,
  EnterpriseTextField,
} from './enterprise-form-sections'
import { useEnterprises } from './enterprises-provider'
import { GroupSelect } from './group-select'

/** 聚焦错误字段时可接收焦点的控件 */
const FOCUSABLE_CONTROLS =
  'input:not([type="hidden"]), textarea, button, [tabindex]:not([tabindex="-1"])'

type EnterpriseMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: EnterpriseListItem
}

/**
 * 新增 / 编辑企业：资料、分组与计费设置一次保存。
 * 先保存资料（含分组），计费设置有变化再做绑定企业主账号的二次验证并调授信接口；
 * 第二步失败时资料已落库，抽屉保持打开，重试只补授信。
 */
export function EnterpriseMutateDrawer(props: EnterpriseMutateDrawerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { triggerRefresh } = useEnterprises()
  const verification = useSecureVerification()
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 本次抽屉里已建好的企业：授信步骤失败后重试走编辑，不会重复建企业
  const [createdEnterprise, setCreatedEnterprise] = useState<Enterprise | null>(
    null
  )
  // 资料已保存、授信未生效时的已保存值：重试时分组没变就不再提交，计费仍与保存前对比
  const [savedValues, setSavedValues] = useState<EnterpriseFormValues | null>(
    null
  )
  // 企业资料（含必填的企业名称）默认展开，开票资料默认收起；校验失败时展开出错的分区
  const [profileOpen, setProfileOpen] = useState(true)
  const [billingProfileOpen, setBillingProfileOpen] = useState(false)
  // 校验失败后等分区展开渲染完，再滚动并聚焦第一个错误字段
  const [pendingErrorFocus, setPendingErrorFocus] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  // 登录邮箱跟随联系人邮箱自动带入，直到用户亲手填过
  const loginEmailEdited = useRef(false)
  // 只在打开抽屉或换了企业时重置表单：保存后列表刷新会把同一企业的新行对象同步进来，
  // 那时重置会把用户刚选的计费设置回显成旧值，也会丢掉 savedValues
  const resetFormKey = useRef<string | null>(null)
  const quotaPerUnit = getCurrencyDisplay().config.quotaPerUnit
  const currentRow = props.currentRow
  const target: Enterprise | undefined =
    currentRow ?? createdEnterprise ?? undefined
  const isUpdate = target !== undefined

  const schema = useMemo(
    () => getEnterpriseFormSchema(t, isUpdate),
    [t, isUpdate]
  )
  const form = useForm<EnterpriseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: ENTERPRISE_FORM_DEFAULT_VALUES,
    // 错误字段可能在收起的分区里，由 onInvalid 展开后自行聚焦
    shouldFocusError: false,
  })
  const mode = useWatch({ control: form.control, name: 'mode' })
  const billingMode = useWatch({ control: form.control, name: 'billing_mode' })
  const contactEmail = useWatch({
    control: form.control,
    name: 'contact_email',
  })

  const formKey = props.open ? String(props.currentRow?.id ?? 'new') : null
  useEffect(() => {
    if (formKey === resetFormKey.current) return
    resetFormKey.current = formKey
    if (formKey === null) return
    setCreatedEnterprise(null)
    setSavedValues(null)
    setProfileOpen(true)
    setBillingProfileOpen(false)
    loginEmailEdited.current = false
    form.reset(
      currentRow
        ? enterpriseToFormValues(currentRow, quotaPerUnit)
        : ENTERPRISE_FORM_DEFAULT_VALUES
    )
  }, [formKey, currentRow, form, quotaPerUnit])

  useEffect(() => {
    if (isUpdate || loginEmailEdited.current) return
    form.setValue('email', contactEmail.trim())
  }, [contactEmail, isUpdate, form])

  useEffect(() => {
    if (!pendingErrorFocus) return
    const frame = window.requestAnimationFrame(() => {
      setPendingErrorFocus(false)
      const message = formRef.current?.querySelector(
        '[data-slot="form-message"]'
      )
      const item = message?.closest<HTMLElement>('[data-slot="form-item"]')
      // block: center 让字段落在抽屉中部，不会被底部固定的操作栏挡住
      item?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      item
        ?.querySelector<HTMLElement>(FOCUSABLE_CONTROLS)
        ?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pendingErrorFocus, profileOpen, billingProfileOpen])

  const isCurrentlyCredit = currentRow?.billing_mode === 'credit'
  const isSuspended = currentRow?.status === 'suspended'

  const refresh = (enterpriseId: number) => {
    void queryClient.invalidateQueries({
      queryKey: ['admin-enterprise', enterpriseId],
    })
    triggerRefresh()
  }

  const onInvalid = (errors: FieldErrors<EnterpriseFormValues>) => {
    if (ENTERPRISE_PROFILE_FIELDS.some((name) => errors[name])) {
      setProfileOpen(true)
    }
    if (BILLING_PROFILE_FIELDS.some((name) => errors[name])) {
      setBillingProfileOpen(true)
    }
    setPendingErrorFocus(true)
    toast.error(t('Please fix the highlighted fields before saving'))
  }

  // values 是点保存那一刻的表单快照：第一步之后表单怎么变，计费变化都按它计算与提交
  const onSubmit = async (values: EnterpriseFormValues) => {
    const saved =
      savedValues ??
      (currentRow
        ? enterpriseToFormValues(currentRow, quotaPerUnit)
        : ENTERPRISE_FORM_DEFAULT_VALUES)
    const creditChange = resolveCreditChange(saved, values)
    const successMessage = t(
      target
        ? SUCCESS_MESSAGES.ENTERPRISE_UPDATED
        : SUCCESS_MESSAGES.ENTERPRISE_CREATED
    )
    setIsSubmitting(true)
    try {
      let enterprise = target
      if (enterprise) {
        const result = await updateEnterprise(
          enterprise.id,
          formValuesToUpdatePayload(values, saved.group)
        )
        if (!result.success) {
          handleServerError(result)
          return
        }
      } else {
        const result = await createEnterprise(formValuesToCreatePayload(values))
        if (!result.success || !result.data) {
          handleServerError(result)
          return
        }
        enterprise = result.data
        setCreatedEnterprise(result.data)
      }
      if (creditChange === 'none') {
        toast.success(successMessage)
        props.onOpenChange(false)
        refresh(enterprise.id)
        return
      }

      // 资料已落库：计费设置保持保存前的值，重试时仍会识别为待生效
      setSavedValues({
        ...values,
        billing_mode: saved.billing_mode,
        credit: saved.credit,
      })
      refresh(enterprise.id)
      const failureTitle = t(
        'Enterprise profile saved, but the credit settings did not take effect'
      )
      try {
        let ownerUserId = enterprise.user_id
        if (!ownerUserId) {
          const detail = requireServerSuccess(
            await getEnterprise(enterprise.id)
          )
          ownerUserId = detail.data?.user_id ?? 0
        }
        const proof = await verification.requestVerification({
          scope: 'admin.user.manage',
          context: { user_id: ownerUserId, action: 'enterprise_credit' },
          title: t('Verify to change enterprise credit'),
          description: t('Confirm your identity before adjusting {{name}}.', {
            name: values.name,
          }),
        })
        if (!proof) {
          toast.error(failureTitle, {
            description: t('Verification was cancelled.'),
          })
          return
        }
        const result =
          creditChange === 'disable'
            ? await disableEnterpriseCredit(enterprise.id, proof.proof_token)
            : await configureEnterpriseCredit(
                enterprise.id,
                values.credit,
                proof.proof_token
              )
        if (!result.success) {
          handleServerError(result, undefined, {
            title: failureTitle,
            description: getServerErrorMessage(result),
          })
          return
        }
        toast.success(successMessage)
        props.onOpenChange(false)
        refresh(enterprise.id)
      } catch (error) {
        const authError = AuthOperationError.from(error)
        handleServerError(authError, undefined, {
          title: failureTitle,
          description: getServerErrorMessage(authError),
        })
      }
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Sheet
        open={props.open}
        // 二次验证对话框叠在抽屉上，点它不能把抽屉关掉
        onOpenChange={(open) =>
          (open || !verification.isActive) && props.onOpenChange(open)
        }
      >
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-[640px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle className='flex items-center gap-2'>
              {isUpdate ? t('Edit Enterprise') : t('Create Enterprise')}
              {currentRow && (
                <StatusBadge
                  label={isSuspended ? t('Suspended') : t('Active')}
                  variant={isSuspended ? 'danger' : 'success'}
                  copyable={false}
                />
              )}
            </SheetTitle>
            <SheetDescription>
              {isUpdate
                ? t('Update the enterprise profile and billing information.')
                : t(
                    'Create a new enterprise owner account, or upgrade an existing common user.'
                  )}
            </SheetDescription>
          </SheetHeader>
          <Form {...form}>
            <form
              ref={formRef}
              id='enterprise-form'
              onSubmit={(event) =>
                void form.handleSubmit(onSubmit, onInvalid)(event)
              }
              className={sideDrawerFormClassName()}
            >
              <fieldset disabled={isSubmitting} className='contents'>
                {!isUpdate && (
                  <SideDrawerSection>
                    <SideDrawerSectionHeader
                      title={t('Owner Account')}
                      description={t(
                        'The owner account signs in to manage employees, API keys and bills. All API keys of the enterprise are billed to this account.'
                      )}
                    />
                    <FormField
                      control={form.control}
                      name='mode'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Account Source')}</FormLabel>
                          <Select
                            items={[
                              {
                                value: 'new_user',
                                label: t('Create a new account'),
                              },
                              {
                                value: 'upgrade',
                                label: t('Upgrade an existing user'),
                              },
                            ]}
                            value={field.value}
                            onValueChange={(value) =>
                              value !== null && field.onChange(value)
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent alignItemWithTrigger={false}>
                              <SelectGroup>
                                <SelectItem value='new_user'>
                                  {t('Create a new account')}
                                </SelectItem>
                                <SelectItem value='upgrade'>
                                  {t('Upgrade an existing user')}
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {mode === 'new_user' ? (
                      <>
                        <EnterpriseTextField
                          control={form.control}
                          name='username'
                          label={t('Username')}
                        />
                        <FormField
                          control={form.control}
                          name='password'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('Password')}</FormLabel>
                              <FormControl>
                                <PasswordInput
                                  {...field}
                                  autoComplete='new-password'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <EnterpriseTextField
                          control={form.control}
                          name='display_name'
                          label={t('Display Name')}
                        />
                        <EnterpriseTextField
                          control={form.control}
                          name='email'
                          label={t('Login Email')}
                          description={t(
                            'Required. Filled from the contact email until you edit it.'
                          )}
                          onUserInput={(value) => {
                            loginEmailEdited.current = value !== ''
                          }}
                        />
                      </>
                    ) : (
                      <FormField
                        control={form.control}
                        name='upgrade_user'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('User to upgrade')}</FormLabel>
                            <FormControl>
                              <UserPicker
                                value={field.value}
                                onChange={(user) => {
                                  field.onChange(user)
                                  // 分组默认沿用该用户当前分组，管理员可再改
                                  if (user) {
                                    form.setValue(
                                      'group',
                                      user.group || DEFAULT_ENTERPRISE_GROUP
                                    )
                                  }
                                }}
                                userType='personal'
                                aria-label={t('User to upgrade')}
                              />
                            </FormControl>
                            <FormDescription>
                              {t(
                                'Only enabled personal users are listed; enterprise owners and members cannot be upgraded. Their balance and history are kept.'
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </SideDrawerSection>
                )}

                <SideDrawerSection>
                  <SideDrawerSectionHeader title={t('Permission Settings')} />
                  <FormField
                    control={form.control}
                    name='group'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Group')}</FormLabel>
                        <FormControl>
                          <GroupSelect
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormDescription>
                          {t(
                            'Decides the groups and price ratio available to all API keys of the enterprise.'
                          )}
                          {isUpdate &&
                            ` ${t('The owner account must sign in again after the group changes.')}`}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SideDrawerSection>

                <SideDrawerSection>
                  <SideDrawerSectionHeader title={t('Billing Settings')} />
                  <FormField
                    control={form.control}
                    name='billing_mode'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Billing Mode')}</FormLabel>
                        <FormControl>
                          <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className='flex flex-col gap-2'
                          >
                            <label className='flex items-start gap-2 text-sm'>
                              <RadioGroupItem value='prepaid' />
                              <span>
                                <span className='font-medium'>
                                  {t('Prepaid')}
                                </span>
                                <span className='text-muted-foreground block text-xs'>
                                  {t(
                                    'Prepaid billing: usage is deducted from the balance; register offline top-ups with the Top-up action on the enterprise row.'
                                  )}
                                </span>
                              </span>
                            </label>
                            <label className='flex items-start gap-2 text-sm'>
                              <RadioGroupItem value='credit' />
                              <span>
                                <span className='font-medium'>
                                  {t('Credit')}
                                </span>
                                <span className='text-muted-foreground block text-xs'>
                                  {t(
                                    'Credit billing: usage is limited per period and billed when the period ends.'
                                  )}
                                </span>
                              </span>
                            </label>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {isCurrentlyCredit && billingMode === 'prepaid' && (
                    <Alert>
                      <AlertDescription>
                        {t(
                          'The current credit period will be closed and billed. Future usage is paid from the balance.'
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                  {billingMode === 'credit' && (
                    <CreditConfigFields
                      control={form.control}
                      periodUsedQuota={
                        isCurrentlyCredit
                          ? currentRow.period_used_quota
                          : undefined
                      }
                    />
                  )}
                </SideDrawerSection>

                <CollapsibleDrawerSection
                  title={t('Enterprise Profile')}
                  open={profileOpen}
                  onOpenChange={setProfileOpen}
                >
                  <EnterpriseProfileFields control={form.control} />
                </CollapsibleDrawerSection>

                <CollapsibleDrawerSection
                  title={t('Billing Profile')}
                  description={t('Printed on bills and invoices as the buyer.')}
                  open={billingProfileOpen}
                  onOpenChange={setBillingProfileOpen}
                >
                  <BillingProfileFields control={form.control} />
                </CollapsibleDrawerSection>

                <SideDrawerSection>
                  <FormField
                    control={form.control}
                    name='remark'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Internal Remark')}</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SideDrawerSection>
              </fieldset>
            </form>
          </Form>
          <SheetFooter className={sideDrawerFooterClassName()}>
            <SheetClose render={<Button variant='outline' />}>
              {t('Cancel')}
            </SheetClose>
            <Button
              form='enterprise-form'
              type='submit'
              disabled={isSubmitting}
            >
              {isSubmitting ? t('Saving...') : t('Save changes')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <SecureVerificationDialog {...verification.dialogProps} />
    </>
  )
}
