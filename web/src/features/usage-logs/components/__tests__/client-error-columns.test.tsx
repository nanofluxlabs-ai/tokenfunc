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
function Cells(props: {
  log: UsageLog
  columnIds: string[]
  onColumnIds?: (ids: string[]) => void
}) {
  const table = useReactTable({
    data: [props.log],
    columns: useCommonLogsColumns(true, false),
    getCoreRowModel: getCoreRowModel(),
  })
  const allCells = table.getRowModel().rows[0].getAllCells()
  props.onColumnIds?.(allCells.map((cell) => cell.column.id))
  const cells = allCells.filter((cell) =>
    props.columnIds.includes(cell.column.id)
  )
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

function renderCells(
  log: UsageLog,
  columnIds: string[],
  onColumnIds?: (ids: string[]) => void
) {
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <Cells log={log} columnIds={columnIds} onColumnIds={onColumnIds} />
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

test('error logs show the HTTP status code column while consume logs leave it empty', () => {
  renderCells(makeLog(5, { status_code: 403 }), ['status_code'])
  expect(screen.getByTestId('cell-status_code')).toHaveTextContent('403')
})

test('consume logs leave the status code column empty even when a status is recorded', () => {
  renderCells(makeLog(2, { status_code: 200 }), ['status_code'])
  expect(screen.getByTestId('cell-status_code')).toBeEmptyDOMElement()
})

test('client source, error category and request path stay out of the table columns', () => {
  let ids: string[] = []
  renderCells(makeLog(2, { client_source: 'curl' }), [], (columnIds) => {
    ids = columnIds
  })
  expect(ids).toContain('status_code')
  expect(ids).not.toContain('client_source')
  expect(ids).not.toContain('error_category')
  expect(ids).not.toContain('request_path')
})
