import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { CreditAlertHint } from '../credit-alert-hint'

test('below the threshold shows the threshold text without a badge', () => {
  render(<CreditAlertHint alertPercent={80} usedPercent={42} />)

  expect(
    screen.getByText(
      'Alert threshold 80% · billing email is notified when reached'
    )
  ).toBeInTheDocument()
  expect(screen.queryByText('Alert threshold reached')).not.toBeInTheDocument()
  expect(screen.queryByText('Limit exhausted')).not.toBeInTheDocument()
})

test('reaching the threshold shows the warning badge', () => {
  render(<CreditAlertHint alertPercent={80} usedPercent={80} />)

  expect(screen.getByText('Alert threshold reached')).toBeInTheDocument()
  expect(screen.queryByText('Limit exhausted')).not.toBeInTheDocument()
})

test('reaching the full limit shows the exhausted badge instead of the warning', () => {
  render(<CreditAlertHint alertPercent={80} usedPercent={100} />)

  expect(screen.getByText('Limit exhausted')).toBeInTheDocument()
  expect(screen.queryByText('Alert threshold reached')).not.toBeInTheDocument()
})

test('a zero threshold renders nothing because alerts are disabled', () => {
  const { container } = render(
    <CreditAlertHint alertPercent={0} usedPercent={95} />
  )

  expect(container).toBeEmptyDOMElement()
})
