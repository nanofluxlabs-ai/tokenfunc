import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CreditNotice } from '../credit-notice'

async function renderInRouter(billingMode?: string) {
  const rootRoute = createRootRoute({
    component: () => <CreditNotice billingMode={billingMode} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()
}

describe('CreditNotice', () => {
  it('links credit-billed enterprise owners to the enterprise bills page', async () => {
    await renderInRouter('credit')
    const link = await screen.findByRole('link', {
      name: 'Open Enterprise Bills',
    })
    expect(link).toHaveAttribute('href', '/enterprise/bills')
  })

  it('renders nothing for prepaid enterprises and ordinary users', () => {
    const { container: prepaid } = render(
      <CreditNotice billingMode='prepaid' />
    )
    expect(prepaid).toBeEmptyDOMElement()
    const { container: plain } = render(<CreditNotice />)
    expect(plain).toBeEmptyDOMElement()
  })
})
