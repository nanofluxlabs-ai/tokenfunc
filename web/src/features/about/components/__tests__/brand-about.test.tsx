import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CAPABILITIES } from '@/features/landing/content'

import { BrandAbout } from '../brand-about'

async function renderBrandAbout() {
  const rootRoute = createRootRoute({ component: BrandAbout })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/about'] }),
  })
  // useSystemConfig 读取 react-query 缓存，需要 QueryClientProvider
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('heading', { level: 1 })
}

afterEach(() => {
  cleanup()
})

describe('BrandAbout', () => {
  it('renders one card per landing capability with its title', async () => {
    await renderBrandAbout()

    const cardTitles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)

    expect(cardTitles).toEqual(
      CAPABILITIES.map((capability) => capability.title)
    )
  })

  it('links the compliance bar to the user agreement and privacy policy', async () => {
    await renderBrandAbout()

    expect(
      screen.getByRole('link', { name: 'User Agreement' })
    ).toHaveAttribute('href', '/user-agreement')
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' })
    ).toHaveAttribute('href', '/privacy-policy')
  })

  it('offers the enterprise trial and sign-up calls to action', async () => {
    await renderBrandAbout()

    // Button 以 render 属性渲染成 <a>，可访问角色是 button，按文字找到锚点再查 href
    expect(
      screen.getByText('Request an enterprise trial').closest('a')
    ).toHaveAttribute('href', '/#contact')
    expect(screen.getByText('Sign up free').closest('a')).toHaveAttribute(
      'href',
      '/sign-up'
    )
  })
})
