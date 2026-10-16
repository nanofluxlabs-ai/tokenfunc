import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterAll, beforeEach, expect, test, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import type { UsageLog } from '../../data/schema'
import type { LogOtherData } from '../../types'
import { useCommonLogsColumns } from '../columns/common-logs-columns'

vi.mock('@lobehub/icons', () => ({}))
vi.hoisted(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
})
afterAll(() => vi.unstubAllGlobals())

function makeLog(type: number, other: LogOtherData): UsageLog {
  return {
    id: 1,
    user_id: 1,
    created_at: 1,
    type,
    content: '',
    username: 'user',
    token_name: 'token',
    model_name: 'gpt-4o',
    quota: 5000,
    prompt_tokens: 1000,
    completion_tokens: 500,
    use_time: 2,
    is_stream: false,
    channel: 1,
    channel_name: '',
    token_id: 1,
    group: 'default',
    ip: '',
    other: JSON.stringify(other),
    request_id: 'req-1',
    upstream_request_id: '',
  }
}

// 只渲染指定列的单元格，避免把详情列的弹窗与定价查询一起拉进来
function Cells(props: { log: UsageLog; columnIds: string[] }) {
  const table = useReactTable({
    data: [props.log],
    columns: useCommonLogsColumns(true, false),
    getCoreRowModel: getCoreRowModel(),
  })
  const cells = table
    .getRowModel()
    .rows[0].getAllCells()
    .filter((cell) => props.columnIds.includes(cell.column.id))
  return (
    <>
      {cells.map((cell) => (
        <div key={cell.column.id} data-testid={`cell-${cell.column.id}`}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </>
  )
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
})

function renderCells(log: UsageLog, columnIds: string[]) {
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <Cells log={log} columnIds={columnIds} />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

test('token cell labels cache read and cache write quantities in words', () => {
  renderCells(makeLog(2, { cache_tokens: 512, cache_creation_tokens: 200 }), [
    'prompt_tokens',
  ])
  const cell = screen.getByTestId('cell-prompt_tokens')
  expect(cell).toHaveTextContent('1,000 / 500')
  expect(cell).toHaveTextContent('Cache Read 512')
  expect(cell).toHaveTextContent('Cache Write 200')
})

test('token cell omits the cache line when neither cache quantity is present', () => {
  renderCells(makeLog(2, { cache_tokens: 0 }), ['prompt_tokens'])
  const cell = screen.getByTestId('cell-prompt_tokens')
  expect(cell).toHaveTextContent('1,000 / 500')
  expect(cell).not.toHaveTextContent('Cache')
})

test('client column shows the classified source with its platform and keeps the raw user agent as a title', () => {
  renderCells(
    makeLog(2, {
      client_source: 'codex',
      client_platform: 'macos',
      client_user_agent: 'codex-cli/1.0.0',
    }),
    ['client_source']
  )
  const cell = screen.getByTestId('cell-client_source')
  expect(cell).toHaveTextContent('Codex')
  expect(cell).toHaveTextContent('macOS')
  expect(cell.querySelector('[title="codex-cli/1.0.0"]')).not.toBeNull()
})

test('client column hides the platform line when the platform is unknown', () => {
  renderCells(
    makeLog(2, { client_source: 'curl', client_platform: 'unknown' }),
    ['client_source']
  )
  const cell = screen.getByTestId('cell-client_source')
  expect(cell).toHaveTextContent('curl')
  expect(cell).not.toHaveTextContent('Unknown')
})

test('error logs render category, status code and request path columns', () => {
  renderCells(
    makeLog(5, {
      error_type: 'new_api_error',
      error_code: 'insufficient_user_quota',
      status_code: 403,
      request_path: '/v1/chat/completions',
    }),
    ['error_category', 'status_code', 'request_path']
  )
  expect(screen.getByTestId('cell-error_category')).toHaveTextContent(
    'Request Rejected'
  )
  expect(screen.getByTestId('cell-status_code')).toHaveTextContent('403')
  expect(screen.getByTestId('cell-request_path')).toHaveTextContent(
    '/v1/chat/completions'
  )
})

test('consume logs keep the error columns empty but still show the request path', () => {
  renderCells(makeLog(2, { request_path: '/v1/responses', status_code: 200 }), [
    'error_category',
    'status_code',
    'request_path',
  ])
  expect(screen.getByTestId('cell-error_category')).toBeEmptyDOMElement()
  expect(screen.getByTestId('cell-status_code')).toBeEmptyDOMElement()
  expect(screen.getByTestId('cell-request_path')).toHaveTextContent(
    '/v1/responses'
  )
})
