import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ModelsSection } from '../components/models-section'

async function renderSection() {
  const rootRoute = createRootRoute({ component: ModelsSection })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('heading', { level: 2 })
}

function rows() {
  const panel = screen.getByRole('tabpanel')
  return within(panel)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    )
}

describe('ModelsSection', () => {
  it('shows the Claude price list by default from the static data', async () => {
    await renderSection()

    expect(screen.getByRole('tab', { name: /Claude/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(rows()).toContainEqual([
      'claude-sonnet-5-5Balanced',
      '$2.00',
      '$0.10',
      '$10.00',
    ])
    expect(rows()).toHaveLength(4)
  })

  it('switches the table and vendor note when another vendor tab is selected', async () => {
    await renderSection()

    fireEvent.click(screen.getByRole('tab', { name: /Gemini/ }))
    expect(screen.getByRole('tab', { name: /Gemini/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(rows().map((row) => row[0])).toEqual([
      'gemini-4-argonFlagship',
      'gemini-3.8-flashBalanced',
      'gemini-3.5-flash-liteLite',
    ])
    expect(rows()[1]).toEqual([
      'gemini-3.8-flashBalanced',
      '$0.75',
      '$0.075',
      '$3.75',
    ])
    expect(
      screen.getByText(
        'Prices follow upstream adjustments; the price shown here is current.'
      )
    ).toBeInTheDocument()
  })

  it('shows all four vendor tabs on one row', async () => {
    await renderSection()

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'ClaudeAnthropic',
      'GPTOpenAI',
      'GeminiGoogle',
      'GrokxAI',
    ])
    expect(screen.getByRole('tablist')).toHaveClass('flex-nowrap')
  })

  it('hides the vendor company names on phones so the four tabs fit on one row', async () => {
    await renderSection()

    const vendorName = screen.getByText('Anthropic')
    expect(vendorName).toHaveClass('hidden', 'sm:inline')
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveClass('px-3', 'sm:px-4')
    }
  })
})
