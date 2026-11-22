import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Hero } from '../components/hero'
import { COMPATIBLE_TOOLS } from '../content'

async function renderHero(registerEnabled: boolean) {
  const rootRoute = createRootRoute({
    component: () => <Hero registerEnabled={registerEnabled} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('heading', { level: 1 })
}

describe('Hero', () => {
  it('exposes a static accessible name on the typewriter heading', async () => {
    await renderHero(true)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      'TokenFunc, real models at full strength, zero content retention, and bills that reconcile line by line'
    )
  })

  it('links the secondary button to the pricing section when sign-up is closed', async () => {
    await renderHero(false)
    expect(screen.getByText('View pricing').closest('a')).toHaveAttribute(
      'href',
      '#pricing'
    )
    expect(screen.queryByText('Sign up free')).not.toBeInTheDocument()
  })

  it('lists each compatible tool once for assistive tech, linked to its docs page', async () => {
    await renderHero(true)
    const region = screen.getByRole('region', { name: 'Compatible tools' })
    const links = region.querySelectorAll('a:not([tabindex="-1"])')
    expect(links).toHaveLength(COMPATIBLE_TOOLS.length)
    expect([...links].map((link) => link.getAttribute('href'))).toEqual(
      COMPATIBLE_TOOLS.map((tool) => `/docs/${tool.docSlug}`)
    )
    expect(region.textContent).not.toMatch(/Kiro|Doubao/)
  })

  it('hides the duplicated marquee copy from screen readers and keyboard focus', async () => {
    await renderHero(true)
    const region = screen.getByRole('region', { name: 'Compatible tools' })
    const lists = region.querySelectorAll('ul')
    expect(lists).toHaveLength(2)
    expect(lists[0]).not.toHaveAttribute('aria-hidden')
    expect(lists[1]).toHaveAttribute('aria-hidden', 'true')
    for (const link of lists[1].querySelectorAll('a')) {
      expect(link).toHaveAttribute('tabindex', '-1')
    }
  })
})
