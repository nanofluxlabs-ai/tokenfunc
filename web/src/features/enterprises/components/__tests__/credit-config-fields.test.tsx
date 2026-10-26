import { render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { expect, test } from 'vitest'

import { Form } from '@/components/ui/form'
import { getCurrencyDisplay } from '@/lib/currency'

import {
  ENTERPRISE_FORM_DEFAULT_VALUES,
  type EnterpriseFormValues,
} from '../../lib/enterprise-form'
import type { CreditCycleType } from '../../types'
import { CreditConfigFields } from '../credit-config-fields'

const WARNING =
  'Below the usage of the current period: the period goes over the limit and requests are rejected as soon as you save.'

function Harness(props: {
  cycleType: CreditCycleType
  limitUsd?: number
  periodUsedQuota?: number
}) {
  const form = useForm<EnterpriseFormValues>({
    defaultValues: {
      ...ENTERPRISE_FORM_DEFAULT_VALUES,
      billing_mode: 'credit',
      credit: {
        ...ENTERPRISE_FORM_DEFAULT_VALUES.credit,
        cycle_type: props.cycleType,
        limit_usd: props.limitUsd ?? 0,
      },
    },
  })
  return (
    <Form {...form}>
      <CreditConfigFields
        control={form.control}
        periodUsedQuota={props.periodUsedQuota}
      />
    </Form>
  )
}

test('quota based credit shows the auto reset switch and no cycle length', () => {
  render(<Harness cycleType='quota_based' />)
  expect(
    screen.getByRole('switch', { name: 'Open next period automatically' })
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('Cycle length (days)')).not.toBeInTheDocument()
})

test('fixed days credit shows the cycle length and no auto reset switch', () => {
  render(<Harness cycleType='fixed_days' />)
  expect(screen.getByLabelText('Cycle length (days)')).toBeInTheDocument()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
})

test('both effective-time notes are always shown', () => {
  render(<Harness cycleType='natural_month' />)
  expect(
    screen.getByText('Limit changes apply to the current period immediately.')
  ).toBeInTheDocument()
  expect(
    screen.getByText('Cycle changes take effect from the next period.')
  ).toBeInTheDocument()
})

test('a limit equal to the period usage warns, a higher one does not', () => {
  const used = 30 * getCurrencyDisplay().config.quotaPerUnit
  const { unmount } = render(
    <Harness cycleType='natural_month' limitUsd={30} periodUsedQuota={used} />
  )
  expect(screen.getByText(WARNING)).toBeInTheDocument()
  unmount()

  render(
    <Harness cycleType='natural_month' limitUsd={31} periodUsedQuota={used} />
  )
  expect(screen.queryByText(WARNING)).not.toBeInTheDocument()
})

test('without the period usage (new credit) no warning is shown', () => {
  render(<Harness cycleType='natural_month' limitUsd={0} />)
  expect(screen.queryByText(WARNING)).not.toBeInTheDocument()
})
