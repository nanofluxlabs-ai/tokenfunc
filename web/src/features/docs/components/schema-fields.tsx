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
// tokenfunc 二开：API 参考页的参数字段树（:::schema 挂件）。仿官方参考文档逐层展开嵌套对象，
// 子级只在点开时渲染，具名类型互相引用也不会一次铺满整页。
import { useQuery } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import { ChevronRight } from 'lucide-react'
import { Marked, type Tokens } from 'marked'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  childrenOf,
  describeType,
  descriptionKey,
  resolveNode,
  variantDescription,
  variantTitle,
  type SchemaNode,
  type SchemaOverlayEntry,
} from '../lib/api-schema'
import { SCHEMA_LOADERS, type SchemaBundle } from '../lib/schema-bundles'
import { docsLangFromUiLanguage, type DocsLang } from '../registry'

type SchemaPart = 'request' | 'response'

type RenderContext = {
  bundle: SchemaBundle
  lang: DocsLang
  part: SchemaPart
}

// 官方说明里的站内链接是相对官方站点的，补全成绝对地址并在新窗口打开
const OFFICIAL_ORIGIN = 'https://platform.openai.com'
const descriptionMarked = new Marked({ gfm: true })
descriptionMarked.use({
  renderer: {
    link(token: Tokens.Link) {
      const inner = this.parser.parseInline(token.tokens)
      const href = token.href.startsWith('/')
        ? `${OFFICIAL_ORIGIN}${token.href}`
        : token.href
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${inner}</a>`
    },
    html(token: Tokens.HTML | Tokens.Tag) {
      return token.text.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    },
  },
})

function Description(props: { text: string; ctx: RenderContext }) {
  const translated =
    props.ctx.lang === 'zh'
      ? (props.ctx.bundle.zh[descriptionKey(props.text)] ?? props.text)
      : props.text
  const html = useMemo(
    () =>
      DOMPurify.sanitize(
        descriptionMarked.parse(translated, { async: false }),
        {
          ADD_ATTR: ['target'],
        }
      ),
    [translated]
  )
  return (
    <div
      className='docs-field-desc'
      // oxlint-disable-next-line react/no-danger -- 官方规范里的说明，经 DOMPurify 清洗
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function NodeDetails(props: {
  node: SchemaNode
  ctx: RenderContext
  overlay?: SchemaOverlayEntry
}) {
  const { t } = useTranslation()
  const resolved = resolveNode(props.ctx.bundle.schema, props.node)
  const description = variantDescription(props.ctx.bundle.schema, props.node)
  const enumValues = resolved?.kind === 'scalar' ? resolved.enum : undefined
  const defaultValue = props.node.default ?? resolved?.default
  const note = props.overlay?.note?.[props.ctx.lang]
  return (
    <>
      {description && <Description text={description} ctx={props.ctx} />}
      {enumValues && enumValues.length > 1 && (
        <div className='docs-field-desc'>
          {t('Allowed values')}:{' '}
          {enumValues.map((value) => (
            <code key={formatValue(value)} className='docs-field-value'>
              {formatValue(value)}
            </code>
          ))}
        </div>
      )}
      {defaultValue !== undefined && (
        <div className='docs-field-desc'>
          {t('Default')}:{' '}
          <code className='docs-field-value'>{formatValue(defaultValue)}</code>
        </div>
      )}
      {note && <div className='docs-field-note'>{note}</div>}
    </>
  )
}

function Expander(props: {
  node: SchemaNode
  ctx: RenderContext
  path: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const children = childrenOf(props.ctx.bundle.schema, props.node)
  if (!children) return null
  let label = open ? t('Hide properties') : t('Show properties')
  if (children.kind === 'variants') {
    label = open
      ? t('Hide types')
      : t('Show {{count}} accepted types', { count: children.variants.length })
  }
  return (
    <div className='docs-schema-children'>
      <button
        type='button'
        className='docs-schema-toggle'
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
          aria-hidden='true'
        />
        {label}
      </button>
      {open && (
        <div id={contentId} className='docs-schema-nested'>
          {children.kind === 'fields' ? (
            <FieldList
              fields={children.fields}
              ctx={props.ctx}
              path={props.path}
            />
          ) : (
            <ul className='docs-fields'>
              {children.variants.map((variant, index) => (
                <VariantItem
                  // oxlint-disable-next-line react/no-array-index-key -- 规范里的类型顺序固定，没有更稳定的标识
                  key={index}
                  node={variant}
                  ctx={props.ctx}
                  path={props.path}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function TypeBadges(props: { node: SchemaNode; ctx: RenderContext }) {
  const { t } = useTranslation()
  const resolved = resolveNode(props.ctx.bundle.schema, props.node)
  const nullable = props.node.nullable || resolved?.nullable
  const deprecated = props.node.deprecated || resolved?.deprecated
  return (
    <>
      <span className='docs-field-type'>
        {describeType(props.ctx.bundle.schema, props.node)}
        {nullable ? ' or null' : ''}
      </span>
      {deprecated && (
        <span className='docs-field-deprecated'>{t('Deprecated')}</span>
      )}
    </>
  )
}

function VariantItem(props: {
  node: SchemaNode
  ctx: RenderContext
  path: string
}) {
  return (
    <li className='docs-field'>
      <div className='docs-field-head'>
        <span className='docs-field-name'>
          {variantTitle(props.ctx.bundle.schema, props.node)}
        </span>
        <TypeBadges node={props.node} ctx={props.ctx} />
      </div>
      <NodeDetails node={props.node} ctx={props.ctx} />
      <Expander node={props.node} ctx={props.ctx} path={props.path} />
    </li>
  )
}

function FieldList(props: {
  fields: { name: string; required: boolean; node: SchemaNode }[]
  ctx: RenderContext
  path: string
}) {
  const { t } = useTranslation()
  return (
    <ul className='docs-fields'>
      {props.fields.map((field) => {
        const path = props.path ? `${props.path}.${field.name}` : field.name
        const overlay = props.ctx.bundle.overlay[props.ctx.part][path]
        return (
          <li key={field.name} className='docs-field'>
            <div className='docs-field-head'>
              <span className='docs-field-name'>{field.name}</span>
              <TypeBadges node={field.node} ctx={props.ctx} />
              {field.required && (
                <span className='docs-field-required'>
                  {t('Required parameter')}
                </span>
              )}
              {overlay?.status === 'not-forwarded' && (
                <span className='docs-field-deprecated'>
                  {t('Not forwarded by this site')}
                </span>
              )}
            </div>
            <NodeDetails node={field.node} ctx={props.ctx} overlay={overlay} />
            <Expander node={field.node} ctx={props.ctx} path={path} />
          </li>
        )
      })}
    </ul>
  )
}

export function SchemaFields(props: { operation?: string; part?: string }) {
  const { t, i18n } = useTranslation()
  const lang = docsLangFromUiLanguage(i18n.resolvedLanguage || i18n.language)
  const loader = props.operation ? SCHEMA_LOADERS[props.operation] : undefined
  const part: SchemaPart = props.part === 'response' ? 'response' : 'request'
  const query = useQuery({
    queryKey: ['docs-schema', props.operation],
    queryFn: () => (loader ? loader() : Promise.reject(new Error('unknown'))),
    enabled: Boolean(loader),
    staleTime: Infinity,
  })
  if (!loader) return null
  if (query.isError) {
    return (
      <p className='docs-field-desc'>
        {t('Failed to load the parameter list.')}
      </p>
    )
  }
  if (!query.data) {
    return <p className='docs-field-desc'>{t('Loading parameters…')}</p>
  }
  const root = resolveNode(query.data.schema, query.data.schema[part])
  if (root?.kind !== 'object') return null
  return (
    <div className='docs-prose docs-schema'>
      <FieldList
        fields={root.fields}
        ctx={{ bundle: query.data, lang, part }}
        path=''
      />
    </div>
  )
}
