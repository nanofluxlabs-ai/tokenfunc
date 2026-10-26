import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  SideDrawerSection,
  SideDrawerSectionHeader,
} from '@/components/drawer-layout'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { MAX_ENTERPRISE_TOKENS } from '../constants'
import type { EnterpriseFormValues } from '../lib/enterprise-form'

type TextFieldName =
  | 'username'
  | 'display_name'
  | 'email'
  | 'name'
  | 'contact_name'
  | 'contact_email'
  | 'contact_phone'
  | 'company_name'
  | 'tax_id'
  | 'address'
  | 'billing_email'
  | 'phone'
  | 'country'

export function EnterpriseTextField(props: {
  control: Control<EnterpriseFormValues>
  name: TextFieldName
  label: string
  placeholder?: string
  description?: string
  /** 只在用户亲手输入时触发，setValue 带入的值不会触发 */
  onUserInput?: (value: string) => void
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              onChange={(event) => {
                field.onChange(event)
                props.onUserInput?.(event.target.value)
              }}
              placeholder={props.placeholder}
            />
          </FormControl>
          {props.description && (
            <FormDescription>{props.description}</FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/** 点标题展开 / 收起的抽屉分区，交互与密钥抽屉的「高级设置」一致 */
export function CollapsibleDrawerSection(props: {
  title: ReactNode
  description?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
      <SideDrawerSection>
        <CollapsibleTrigger
          render={
            <button
              type='button'
              className='hover:bg-muted/40 flex w-full items-center gap-3 rounded-md py-1.5 text-left transition-colors'
            />
          }
        >
          <SideDrawerSectionHeader
            className='flex-1'
            title={props.title}
            description={props.description}
          />
          <ChevronDown
            aria-hidden='true'
            className={cn(
              'text-muted-foreground size-4 shrink-0 transition-transform',
              props.open && 'rotate-180'
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className='flex flex-col gap-4 pt-2'>{props.children}</div>
        </CollapsibleContent>
      </SideDrawerSection>
    </Collapsible>
  )
}

function IntegerField(props: {
  control: Control<EnterpriseFormValues>
  name: 'payment_terms_days' | 'max_tokens'
  label: string
  description: string
  min: number
  max: number
}) {
  return (
    <FormField
      control={props.control}
      name={props.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Input
              type='number'
              min={props.min}
              max={props.max}
              value={field.value}
              onBlur={field.onBlur}
              onChange={(event) =>
                field.onChange(Number.parseInt(event.target.value, 10) || 0)
              }
            />
          </FormControl>
          <FormDescription>{props.description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function EnterpriseProfileFields(props: {
  control: Control<EnterpriseFormValues>
}) {
  const { t } = useTranslation()
  return (
    <>
      <EnterpriseTextField
        control={props.control}
        name='contact_name'
        label={t('Contact Name')}
      />
      <EnterpriseTextField
        control={props.control}
        name='contact_email'
        label={t('Contact Email')}
      />
      <EnterpriseTextField
        control={props.control}
        name='contact_phone'
        label={t('Contact Phone')}
      />
      <IntegerField
        control={props.control}
        name='payment_terms_days'
        label={t('Payment Terms (days)')}
        description={t('Bills are due this many days after issue.')}
        min={1}
        max={365}
      />
      <IntegerField
        control={props.control}
        name='max_tokens'
        label={t('Max API Keys')}
        description={t('0 means the site-wide per-user limit applies.')}
        min={0}
        max={MAX_ENTERPRISE_TOKENS}
      />
    </>
  )
}

export function BillingProfileFields(props: {
  control: Control<EnterpriseFormValues>
}) {
  const { t } = useTranslation()
  return (
    <>
      <EnterpriseTextField
        control={props.control}
        name='company_name'
        label={t('Company Legal Name')}
      />
      <EnterpriseTextField
        control={props.control}
        name='tax_id'
        label={t('Tax ID')}
      />
      <EnterpriseTextField
        control={props.control}
        name='address'
        label={t('Address')}
      />
      <EnterpriseTextField
        control={props.control}
        name='country'
        label={t('Country / Region')}
      />
      <EnterpriseTextField
        control={props.control}
        name='billing_email'
        label={t('Billing Email')}
      />
      <EnterpriseTextField
        control={props.control}
        name='phone'
        label={t('Phone')}
      />
    </>
  )
}
