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
import { useNavigate } from '@tanstack/react-router'
import DOMPurify from 'dompurify'
import { AlertTriangle, Info, Lightbulb, type LucideIcon } from 'lucide-react'
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type MouseEvent,
} from 'react'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import {
  fillDocVariables,
  type CalloutTone,
  type DocBlock,
} from '../lib/doc-markdown'
import { DocWidget } from './doc-widgets'

type DocRenderContext = {
  vars: Record<string, string>
  /** 用户最近点过的标签名；同名标签（如 macOS / Windows）在整页联动 */
  preferredTab: string | null
  setPreferredTab: (label: string) => void
}

const RenderContext = createContext<DocRenderContext | null>(null)

// 解析结果按页面缓存，块对象本身稳定，用它换一个稳定的 React key
const blockKeys = new WeakMap<DocBlock, string>()
let nextBlockKey = 0

function keyOf(block: DocBlock): string {
  let key = blockKeys.get(block)
  if (!key) {
    key = `doc-block-${nextBlockKey++}`
    blockKeys.set(block, key)
  }
  return key
}

function useRenderContext(): DocRenderContext {
  const ctx = useContext(RenderContext)
  if (!ctx) throw new Error('DocBlocks must be rendered inside DocContent')
  return ctx
}

const SANITIZE_OPTIONS = {
  ADD_ATTR: ['target', 'loading'],
}

function DocHtml(props: { html: string }) {
  const ctx = useRenderContext()
  const navigate = useNavigate()
  const html = useMemo(
    () =>
      DOMPurify.sanitize(
        fillDocVariables(props.html, ctx.vars, 'html'),
        SANITIZE_OPTIONS
      ),
    [props.html, ctx.vars]
  )

  // 正文里的站内链接走前端路由，避免整页刷新
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!anchor || !href || anchor.target) return
    if (!href.startsWith('/') || href.startsWith('//')) return
    event.preventDefault()
    void navigate({ href })
  }

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- 只拦截内部链接的点击，键盘回车由链接本身触发
    <div
      className='docs-prose'
      onClick={handleClick}
      // oxlint-disable-next-line react/no-danger -- 正文是仓库内的 Markdown，变量已转义并经 DOMPurify 清洗
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function DocCode(props: { code: string; lang: string; title?: string }) {
  const ctx = useRenderContext()
  const code = fillDocVariables(props.code, ctx.vars, 'text')
  const block = (
    <CodeBlock
      code={code}
      language={props.lang}
      title={props.title}
      enableCollapse={false}
      className='docs-block my-0'
    >
      <CodeBlockCopyButton />
    </CodeBlock>
  )
  if (!props.title) return block
  // 标题多是配置文件路径，CodeBlock 自带的工具栏会转成大写，这里单独展示原样路径
  return (
    <figure className='docs-block'>
      <figcaption className='text-muted-foreground mb-1.5 font-mono text-xs'>
        {props.title}
      </figcaption>
      {block}
    </figure>
  )
}

function DocTabs(props: { tabs: { label: string; blocks: DocBlock[] }[] }) {
  const ctx = useRenderContext()
  const labels = props.tabs.map((tab) => tab.label)
  const [local, setLocal] = useState(labels[0])
  const active =
    ctx.preferredTab && labels.includes(ctx.preferredTab)
      ? ctx.preferredTab
      : local
  const current =
    props.tabs.find((tab) => tab.label === active) ?? props.tabs[0]

  return (
    <div className='docs-block'>
      <Tabs
        value={current.label}
        onValueChange={(value) => {
          setLocal(String(value))
          ctx.setPreferredTab(String(value))
        }}
      >
        <TabsList className='bg-muted/40 h-8 p-0.5'>
          {props.tabs.map((tab) => (
            <TabsTrigger
              key={tab.label}
              value={tab.label}
              className='h-9 px-3 text-xs sm:h-7 sm:px-2.5'
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className='mt-2'>
        <DocBlocks blocks={current.blocks} />
      </div>
    </div>
  )
}

function DocSteps(props: { steps: { title: string; blocks: DocBlock[] }[] }) {
  const ctx = useRenderContext()
  return (
    <ol className='docs-block space-y-7'>
      {props.steps.map((step, index) => (
        <li key={step.title} className='flex gap-3.5'>
          <span className='bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
            {index + 1}
          </span>
          <div className='min-w-0 flex-1'>
            <h3 className='text-foreground text-[15px] font-semibold'>
              {fillDocVariables(step.title, ctx.vars, 'text')}
            </h3>
            <div className='mt-2'>
              <DocBlocks blocks={step.blocks} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

const CALLOUT_STYLES: Record<
  CalloutTone,
  { icon: LucideIcon; className: string }
> = {
  tip: {
    icon: Lightbulb,
    className: 'border-primary/30 bg-primary/5 [&_svg]:text-primary',
  },
  note: {
    icon: Info,
    className: 'border-border bg-muted/30 [&_svg]:text-muted-foreground',
  },
  warning: {
    icon: AlertTriangle,
    className:
      'border-amber-500/40 bg-amber-500/5 [&_svg]:text-amber-600 dark:[&_svg]:text-amber-400',
  },
}

function DocCallout(props: { tone: CalloutTone; blocks: DocBlock[] }) {
  const style = CALLOUT_STYLES[props.tone]
  const Icon = style.icon
  return (
    <aside
      className={cn(
        'docs-block flex gap-3 rounded-lg border p-3.5',
        style.className
      )}
    >
      <Icon className='mt-1 size-4 shrink-0' aria-hidden='true' />
      <div className='docs-callout-body min-w-0 flex-1'>
        <DocBlocks blocks={props.blocks} />
      </div>
    </aside>
  )
}

function DocBlocks(props: { blocks: DocBlock[] }) {
  return (
    <div className='docs-blocks'>
      {props.blocks.map((block) => {
        switch (block.kind) {
          case 'html':
            return <DocHtml key={keyOf(block)} html={block.html} />
          case 'code':
            return (
              <DocCode
                key={keyOf(block)}
                code={block.code}
                lang={block.lang}
                title={block.title}
              />
            )
          case 'tabs':
            return <DocTabs key={keyOf(block)} tabs={block.tabs} />
          case 'steps':
            return <DocSteps key={keyOf(block)} steps={block.steps} />
          case 'callout':
            return (
              <DocCallout
                key={keyOf(block)}
                tone={block.tone}
                blocks={block.blocks}
              />
            )
          case 'widget':
            return (
              <DocWidget
                key={keyOf(block)}
                name={block.name}
                attrs={block.attrs}
              />
            )
        }
        return null
      })}
    </div>
  )
}

/** 渲染解析后的文档正文，{{变量}} 在这里按当前取值替换 */
export function DocContent(props: {
  blocks: DocBlock[]
  vars: Record<string, string>
}) {
  const [preferredTab, setPreferredTab] = useState<string | null>(null)
  const ctx = useMemo(
    () => ({ vars: props.vars, preferredTab, setPreferredTab }),
    [props.vars, preferredTab]
  )
  return (
    <RenderContext.Provider value={ctx}>
      <DocBlocks blocks={props.blocks} />
    </RenderContext.Provider>
  )
}
