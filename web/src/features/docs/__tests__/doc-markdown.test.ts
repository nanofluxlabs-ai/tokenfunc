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
import { describe, expect, it } from 'vitest'

import {
  fillDocVariables,
  parseDoc,
  renderDocHtml,
  type DocBlock,
} from '../lib/doc-markdown'

const kinds = (blocks: DocBlock[]) => blocks.map((block) => block.kind)

describe('parseDoc', () => {
  it('splits nested steps, tabs and callouts into blocks', () => {
    const source = [
      ':::steps',
      '### Install',
      '',
      ':::tabs',
      '@tab macOS',
      '```bash',
      'brew install tool',
      '```',
      '@tab Windows',
      '```powershell',
      'winget install tool',
      '```',
      ':::',
      '',
      '### Verify',
      '',
      ':::tip',
      'Run it once.',
      ':::',
      ':::',
    ].join('\n')

    const [steps] = parseDoc(source, 'zh').blocks
    expect(steps.kind).toBe('steps')
    if (steps.kind !== 'steps') return
    expect(steps.steps.map((step) => step.title)).toEqual(['Install', 'Verify'])
    const [tabs] = steps.steps[0].blocks
    expect(tabs.kind).toBe('tabs')
    if (tabs.kind !== 'tabs') return
    expect(tabs.tabs.map((tab) => tab.label)).toEqual(['macOS', 'Windows'])
    expect(tabs.tabs[1].blocks).toEqual([
      { kind: 'code', code: 'winget install tool', lang: 'powershell' },
    ])
    expect(kinds(steps.steps[1].blocks)).toEqual(['callout'])
  })

  it('keeps directive markers inside fenced code as plain code', () => {
    const source = ['```text', ':::tabs', '@tab A', ':::', '```'].join('\n')
    expect(parseDoc(source, 'zh').blocks).toEqual([
      { kind: 'code', code: ':::tabs\n@tab A\n:::', lang: 'text' },
    ])
  })

  it('reads the code block title from the fence info string', () => {
    const source = [
      '```json title="~/.claude/settings.json"',
      '{}',
      '```',
    ].join('\n')
    expect(parseDoc(source, 'zh').blocks).toEqual([
      {
        kind: 'code',
        code: '{}',
        lang: 'json',
        title: '~/.claude/settings.json',
      },
    ])
  })

  it('parses widgets with attributes and rejects widgets with a body', () => {
    expect(parseDoc(':::cc-switch{app="codex"}\n:::', 'zh').blocks).toEqual([
      { kind: 'widget', name: 'cc-switch', attrs: { app: 'codex' } },
    ])
    expect(() => parseDoc(':::cc-switch\ntext\n:::', 'zh')).toThrow(
      /must not have a body/
    )
  })

  it('throws on an unclosed directive', () => {
    expect(() => parseDoc(':::steps\n### A\n', 'zh')).toThrow(
      /Unclosed :::steps/
    )
  })

  it('collects h2/h3 headings with unique ids, excluding step titles', () => {
    const source = [
      '## 安装',
      '## 安装',
      ':::steps',
      '### Step one',
      ':::',
      '### Notes',
    ].join('\n')
    expect(parseDoc(source, 'zh').headings).toEqual([
      { id: '安装', text: '安装', level: 2 },
      { id: '安装-2', text: '安装', level: 2 },
      { id: 'notes', text: 'Notes', level: 3 },
    ])
  })

  it('renders todo: images as screenshot placeholders and escapes raw HTML', () => {
    const [block] = parseDoc(
      '![设置页](todo:tools/a.png)\n\n<script>x</script>',
      'zh'
    ).blocks
    expect(block.kind).toBe('html')
    if (block.kind !== 'html') return
    expect(block.html).toContain('docs-shot-placeholder')
    expect(block.html).toContain('截图待补充')
    expect(block.html).toContain('tools/a.png')
    expect(block.html).not.toContain('<script>')
  })

  it('keeps English readers on English pages when following docs links', () => {
    const [en] = parseDoc('[FAQ](/docs/faq#401)', 'en').blocks
    const [zh] = parseDoc('[FAQ](/docs/faq#401)', 'zh').blocks
    expect(en.kind === 'html' && en.html).toContain(
      'href="/docs/faq?lang=en#401"'
    )
    expect(zh.kind === 'html' && zh.html).toContain('href="/docs/faq#401"')
  })

  it('collects top-level request and response examples into the aside', () => {
    const source = [
      ':::request-example',
      '@tab cURL',
      '```bash',
      'curl {{baseUrl}}',
      '```',
      '@tab Python',
      '```python',
      'print(1)',
      '```',
      ':::',
      ':::response-example',
      '@tab 200',
      '```json',
      '{}',
      '```',
      ':::',
    ].join('\n')
    const parsed = parseDoc(source, 'zh')
    expect(parsed.aside).toEqual([
      {
        kind: 'example',
        role: 'request',
        samples: [
          { label: 'cURL', code: 'curl {{baseUrl}}', lang: 'bash' },
          { label: 'Python', code: 'print(1)', lang: 'python' },
        ],
      },
      {
        kind: 'example',
        role: 'response',
        samples: [{ label: '200', code: '{}', lang: 'json' }],
      },
    ])
    // 示例同时留在正文原位，窄屏没有右侧栏时显示
    expect(parsed.blocks).toEqual(parsed.aside)
    expect(parseDoc('## 概述', 'zh').aside).toEqual([])
  })

  it('rejects an example tab that is not a single code block', () => {
    expect(() =>
      parseDoc(':::request-example\n@tab cURL\nplain text\n:::', 'zh')
    ).toThrow(/exactly one code block/)
  })

  it('renders a :::params table as a field list with type and required tags', () => {
    const source = [
      ':::params',
      '| 参数 | 类型 | 必填 | 说明 |',
      '| --- | --- | --- | --- |',
      '| `model` | string | 是 | 模型名，见 [模型列表](/docs/api-models) |',
      '| `stream` | boolean | 否 | 是否流式 |',
      ':::',
    ].join('\n')
    const [block] = parseDoc(source, 'zh').blocks
    expect(block.kind).toBe('html')
    if (block.kind !== 'html') return
    const doc = new DOMParser().parseFromString(block.html, 'text/html')
    const fields = [...doc.querySelectorAll('.docs-field')]
    expect(
      fields.map((el) => el.querySelector('.docs-field-name')?.textContent)
    ).toEqual(['model', 'stream'])
    expect(
      fields.map((el) => el.querySelector('.docs-field-type')?.textContent)
    ).toEqual(['string', 'boolean'])
    // 只有必填参数带标签
    expect(
      fields.map(
        (el) => el.querySelector('.docs-field-required')?.textContent ?? null
      )
    ).toEqual(['必填', null])
    expect(
      fields[0].querySelector('.docs-field-desc a')?.getAttribute('href')
    ).toBe('/docs/api-models')
  })

  it('renders a two-column :::params table without type or required tags', () => {
    const source = [
      ':::params',
      '| Field | Description |',
      '| --- | --- |',
      '| `data[].id` | Model name |',
      ':::',
    ].join('\n')
    const [block] = parseDoc(source, 'en').blocks
    expect(block.kind === 'html' && block.html).toContain('Model name')
    expect(block.kind === 'html' && block.html).not.toContain('docs-field-type')
    expect(block.kind === 'html' && block.html).not.toContain(
      'docs-field-required'
    )
  })
})

describe('fillDocVariables', () => {
  const vars = { baseUrl: 'https://api.example.com', apiKey: 'sk-<&>' }

  it('substitutes raw values in code and escaped values in HTML', () => {
    expect(fillDocVariables('KEY={{apiKey}}', vars, 'text')).toBe('KEY=sk-<&>')
    expect(fillDocVariables('<code>{{apiKey}}</code>', vars, 'html')).toBe(
      '<code>sk-&lt;&amp;&gt;</code>'
    )
  })

  it('fills variables that marked URL-encoded inside link targets', () => {
    expect(
      fillDocVariables('href="%7B%7BbaseUrl%7D%7D/v1"', vars, 'html')
    ).toBe('href="https://api.example.com/v1"')
  })

  it('leaves unknown variables untouched so typos stay visible', () => {
    expect(fillDocVariables('{{baseUrll}}', vars, 'text')).toBe('{{baseUrll}}')
  })
})

describe('renderDocHtml', () => {
  it('expands every tab and step for crawlers and fills variables in code', () => {
    const parsed = parseDoc(
      [
        ':::tabs',
        '@tab A',
        '```bash',
        'curl {{baseUrl}}',
        '```',
        '@tab B',
        'Second tab',
        ':::',
        ':::base-url',
        ':::',
      ].join('\n'),
      'en'
    )
    const html = renderDocHtml(parsed, { baseUrl: 'https://x.test' })
    expect(html).toContain('<h4>A</h4>')
    expect(html).toContain('<h4>B</h4>')
    expect(html).toContain('curl https://x.test')
    expect(html).toContain('<code>https://x.test</code>')
  })

  it('renders the endpoint line and every example sample for crawlers', () => {
    const parsed = parseDoc(
      [
        ':::endpoint{method="POST" path="/v1/messages" operation="messages"}',
        ':::',
        ':::response-example',
        '@tab 200',
        '```json',
        '{"ok": true}',
        '```',
        ':::',
      ].join('\n'),
      'en'
    )
    const html = renderDocHtml(parsed, { baseUrl: 'https://x.test' })
    expect(html).toContain('POST https://x.test/v1/messages')
    expect(html).toContain('<h4>200</h4>')
    expect(html).toContain('{&quot;ok&quot;: true}')
  })
})
