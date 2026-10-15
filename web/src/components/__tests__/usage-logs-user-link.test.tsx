import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { UsageLogsUserLink } from '../usage-logs-user-link'

async function renderInRouter(username: string) {
  const rootRoute = createRootRoute({
    component: () => <UsageLogsUserLink username={username} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()
}

test('links the username to the common usage logs filtered by that username', async () => {
  await renderInRouter('acme')
  const link = await screen.findByRole('link', {
    name: 'View usage logs of acme',
  })
  expect(link).toHaveTextContent('acme')
  expect(link).toHaveAttribute(
    'href',
    '/usage-logs/common?username=acme&page=1'
  )
})

test('encodes usernames that are not URL safe', async () => {
  await renderInRouter('team lead+1')
  const link = await screen.findByRole('link', {
    name: 'View usage logs of team lead+1',
  })
  // 不锁定具体转义方式，只要求按标准 query 解析后能还原用户名
  const query = new URLSearchParams(link.getAttribute('href')?.split('?')[1])
  expect(query.get('username')).toBe('team lead+1')
})
