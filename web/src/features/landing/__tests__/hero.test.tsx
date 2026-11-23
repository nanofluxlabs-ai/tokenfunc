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
import {
  COMPATIBLE_TOOLS,
  HERO_PHRASES_SUMMARY,
  HERO_TITLE,
} from '../content'

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
  it('uses the fixed selling-point title as the heading name', async () => {
    await renderHero(true)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
      HERO_TITLE
    )
  })

  it('hides the typewriter line from assistive tech and reads all phrases in one sentence', async () => {
    await renderHero(true)
    expect(screen.getByTestId('hero-typed')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    expect(screen.getByText(HERO_PHRASES_SUMMARY)).toBeInTheDocument()
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
