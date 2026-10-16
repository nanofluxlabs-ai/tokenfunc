import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import type { UsageLog } from '../../data/schema'
import type { LogOtherData } from '../../types'
import { DetailsDialog } from '../dialogs/details-dialog'

vi.mock('@lobehub/icons', () => ({}))

function makeLog(type: number, other: LogOtherData): UsageLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 1,
    type,
    content: type === 5 ? 'status_code=500, upstream error' : '',
    username: 'user',
    token_name: 'token',
    model_name: 'gpt-4o',
    quota: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    use_time: 0,
    is_stream: false,
    channel: 1,
    channel_name: 'channel',
    token_id: 1,
    group: 'default',
    ip: '',
    other: JSON.stringify(other),
    request_id: 'req-1',
    upstream_request_id: '',
  }
}

const i18n = createInstance()
let client: QueryClient
beforeEach(async () => {
  await i18n.init({
    lng: 'en',
    resources: { en },
    interpolation: { escapeValue: false },
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60_000 })
})
afterEach(() => client.clear())

function renderDetails(log: UsageLog, isAdmin = false) {
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <DetailsDialog
          log={log}
          isAdmin={isAdmin}
          isRoot={false}
          open
          onOpenChange={() => undefined}
        />
      </QueryClientProvider>
    </I18nextProvider>
  )
  return screen.getByRole('dialog')
}

test('error log details show category, status code, error code and request path', () => {
  const dialog = renderDetails(
    makeLog(5, {
      error_type: 'new_api_error',
      error_code: 'do_request_failed',
      status_code: 500,
      request_path: '/v1/chat/completions',
    })
  )
  expect(within(dialog).getByText('Upstream Failed')).toBeVisible()
  expect(within(dialog).getByText('500')).toBeVisible()
  expect(within(dialog).getByText('do_request_failed')).toBeVisible()
  expect(within(dialog).getByText('/v1/chat/completions')).toBeVisible()
})

test('consume log details show the client section but no error section', () => {
  const dialog = renderDetails(
    makeLog(2, {
      model_ratio: 1,
      client_source: 'browser',
      client_platform: 'macos',
      client_user_agent: 'Mozilla/5.0 Chrome/136',
      request_path: '/v1/chat/completions',
    })
  )
  expect(within(dialog).getByText('Client Source')).toBeVisible()
  expect(within(dialog).getByText('Browser')).toBeVisible()
  expect(within(dialog).getByText('macOS')).toBeVisible()
  expect(within(dialog).getByText('Mozilla/5.0 Chrome/136')).toBeVisible()
  expect(within(dialog).queryByText('Error Category')).toBeNull()
})

test('details without client fields render no client section', () => {
  const dialog = renderDetails(makeLog(2, { model_ratio: 1 }))
  expect(within(dialog).queryByText('Client Source')).toBeNull()
})
