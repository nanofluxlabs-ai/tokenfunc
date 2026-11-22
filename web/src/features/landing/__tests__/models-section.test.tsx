import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PricingData, PricingModel } from '@/features/pricing/types'

import { ModelsSection } from '../components/models-section'

const getPricing = vi.fn()

vi.mock('@/features/pricing/api', () => ({
  getPricing: () => getPricing(),
}))

function model(name: string, ratio = 1): PricingModel {
  return {
    id: 1,
    model_name: name,
    quota_type: 0,
    model_ratio: ratio,
    completion_ratio: 5,
    cache_ratio: 0.05,
    enable_groups: ['default'],
  } as PricingModel
}

function pricing(models: PricingModel[]): PricingData {
  return {
    success: true,
    data: models,
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  }
}

async function renderSection() {
  const rootRoute = createRootRoute({ component: ModelsSection })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('heading', { level: 2 })
}

function modelCells() {
  const panel = screen.getByRole('tabpanel')
  return within(panel)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent)
}

beforeEach(() => {
  getPricing.mockReset()
})

describe('ModelsSection', () => {
  it('shows only featured models that exist in the pricing data, in config order', async () => {
    getPricing.mockResolvedValue(
      pricing([model('claude-sonnet-5-5'), model('claude-opus-5-5', 2)])
    )
    await renderSection()

    await screen.findByRole('tabpanel')
    expect(modelCells()).toEqual([
      'claude-opus-5-5Flagship',
      'claude-sonnet-5-5Balanced',
    ])
    expect(screen.queryByText('claude-fable-5-2')).not.toBeInTheDocument()
  })

  it('switches the table when another vendor tab is selected', async () => {
    getPricing.mockResolvedValue(
      pricing([model('claude-sonnet-5-5'), model('gpt-6.2-sol')])
    )
    await renderSection()

    fireEvent.click(await screen.findByRole('tab', { name: /GPT/ }))
    expect(screen.getByRole('tab', { name: /GPT/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(modelCells()).toEqual(['gpt-6.2-solBalanced'])
  })

  it('hides vendor tabs that have no featured model in the pricing data', async () => {
    getPricing.mockResolvedValue(pricing([model('claude-sonnet-5-5')]))
    await renderSection()

    await screen.findByRole('tabpanel')
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'ClaudeAnthropic',
    ])
  })

  it('shows the syncing empty state when the pricing data is empty', async () => {
    getPricing.mockResolvedValue(pricing([]))
    await renderSection()

    expect(await screen.findByText('Syncing prices')).toBeInTheDocument()
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
  })

  it('shows the syncing empty state when the pricing request fails', async () => {
    getPricing.mockRejectedValue(new Error('network'))
    await renderSection()

    expect(await screen.findByText('Syncing prices')).toBeInTheDocument()
  })
})
