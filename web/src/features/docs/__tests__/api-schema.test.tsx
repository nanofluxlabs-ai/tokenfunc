/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// 字段树：生成数据与翻译表、本站差异层保持一致，挂件能逐层展开嵌套字段
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SchemaFields } from '../components/schema-fields'
import {
  childrenOf,
  collectDescriptions,
  describeType,
  descriptionKey,
  resolveNode,
  type ApiSchema,
  type SchemaChildren,
  type SchemaField,
  type SchemaNode,
  type SchemaOverlay,
  type SchemaTranslations,
} from '../lib/api-schema'
import { SCHEMA_OPERATIONS } from '../lib/schema-bundles'

const schemaDir = path.resolve(import.meta.dirname, '../schemas')

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(schemaDir, file), 'utf8')) as T
}

const inputNode: SchemaNode = {
  kind: 'union',
  variants: [
    { kind: 'scalar', type: 'string' },
    { kind: 'array', items: { kind: 'ref', ref: 'Message' } },
  ],
}

const fixture: ApiSchema = {
  source: {
    name: 'Test',
    version: '1',
    url: 'https://example.com',
    origin: 'https://example.com',
  },
  request: {
    kind: 'object',
    fields: [{ name: 'input', required: false, node: inputNode }],
  },
  response: { kind: 'object', fields: [] },
  defs: {
    Message: {
      kind: 'object',
      description: 'A message.',
      fields: [
        {
          name: 'role',
          required: true,
          node: { kind: 'scalar', type: 'string' },
        },
        {
          name: 'next',
          required: false,
          node: { kind: 'ref', ref: 'Message' },
        },
      ],
    },
  },
}

describe('api schema helpers', () => {
  it('labels unions and arrays through named types', () => {
    expect(describeType(fixture, inputNode)).toBe('string or array of object')
  })

  it('expands a self-referencing type one level at a time', () => {
    const children = childrenOf(fixture, { kind: 'ref', ref: 'Message' })
    expect(children?.kind).toBe('fields')
    const next =
      children?.kind === 'fields' ? children.fields[1].node : undefined
    expect(next && resolveNode(fixture, next)?.kind).toBe('object')
  })
})

const schemaIds = readdirSync(schemaDir)
  .filter((file) => /^[a-z-]+\.json$/.test(file))
  .map((file) => file.replace(/\.json$/, ''))

describe.each(schemaIds)('schema data (%s)', (id) => {
  const schema = readJson<ApiSchema>(`${id}.json`)
  const zh = readJson<SchemaTranslations>(`${id}.zh.json`)
  const overlay = readJson<SchemaOverlay>(`${id}.overlay.json`)
  const used = new Map(
    [...collectDescriptions(schema)].map((text) => [descriptionKey(text), text])
  )

  it('is registered as a :::schema operation', () => {
    expect(SCHEMA_OPERATIONS).toContain(id)
  })

  it('has a Chinese translation for every description and no stale ones', () => {
    // 缺翻译时运行 bun run docs:schema，按 .tmp/docs-schema 下的清单补齐
    expect([...used.keys()].filter((key) => !(key in zh))).toEqual([])
    expect(Object.keys(zh).filter((key) => !used.has(key))).toEqual([])
  })

  it('keeps code unchanged in translations', () => {
    // 先取出 ``` 多行代码块，剩下的正文再取行内代码，避免两种反引号错位配对
    const codeSpans = (text: string) => {
      const blocks = text.match(/```[\s\S]*?```/g) ?? []
      const prose = text.replaceAll(/```[\s\S]*?```/g, '')
      return [...blocks, ...(prose.match(/`[^`\n]+`/g) ?? [])].sort()
    }
    const changed = [...used]
      .filter(
        ([key, text]) =>
          zh[key] !== undefined &&
          codeSpans(zh[key]).join('|') !== codeSpans(text).join('|')
      )
      .map(([key]) => key)
    expect(changed).toEqual([])
  })

  it('only annotates field paths that exist', () => {
    const exists = (root: SchemaNode, fieldPath: string) => {
      let node: SchemaNode | undefined = root
      for (const name of fieldPath.split('.')) {
        const children: SchemaChildren | undefined = node
          ? childrenOf(schema, node)
          : undefined
        const fields: SchemaField[] =
          children?.kind === 'fields'
            ? children.fields
            : (children?.variants ?? []).flatMap((variant) => {
                const inner = childrenOf(schema, variant)
                return inner?.kind === 'fields' ? inner.fields : []
              })
        node = fields.find((field) => field.name === name)?.node
      }
      return Boolean(node)
    }
    const missing = (['request', 'response'] as const).flatMap((part) =>
      Object.keys(overlay[part]).filter((key) => !exists(schema[part], key))
    )
    expect(missing).toEqual([])
  })
})

const FIELD_NAME = '.docs-field-name'

function renderRequestFields() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SchemaFields operation='responses-create' part='request' />
    </QueryClientProvider>
  )
}

describe('SchemaFields', () => {
  afterEach(cleanup)

  it('shows nested properties only after the toggle is opened', async () => {
    renderRequestFields()
    const reasoning = (
      await screen.findByText('reasoning', { selector: FIELD_NAME })
    ).closest('li')
    expect(screen.queryByText('effort', { selector: FIELD_NAME })).toBeNull()

    const toggle = reasoning?.querySelector('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle as HTMLButtonElement)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('effort', { selector: FIELD_NAME })).toBeVisible()
  })

  it('marks parameters this site does not forward', async () => {
    renderRequestFields()
    const field = (
      await screen.findByText('service_tier', { selector: FIELD_NAME })
    ).closest('li')
    expect(field).toHaveTextContent('Not forwarded by this site')
  })
})
