import { Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'

import {
  PLAYGROUND_REPLIES,
  QUICKSTART_STEPS,
  SNIPPET_GROUPS,
  SNIPPETS,
  type Snippet,
  type SnippetGroup,
} from '../content'
import { useReveal } from '../hooks/use-reveal'
import { Panel, PillTabs, Section, SectionHeading } from './landing-primitives'

const STREAM_STEP = 2
const STREAM_INTERVAL = 32

/** 当前站点对外的 API 地址：后台配置的服务器地址优先，否则取当前 origin */
function useApiBase(): string {
  const { status } = useStatus()
  const configured =
    typeof status?.server_address === 'string'
      ? status.server_address.trim()
      : ''
  if (configured) return configured.replace(/\/+$/, '')
  if (typeof window === 'undefined') return 'https://api.tokenfunc.com'
  return window.location.origin
}

/** 右侧模拟流式回复：按首 token 延迟等待后逐字输出（演示，不发请求） */
function usePlaygroundStream(snippet: Snippet, runId: number) {
  const { t } = useTranslation()
  const reply = PLAYGROUND_REPLIES[snippet.model]
  const text = t(reply.text)
  const [position, setPosition] = useState(0)
  const [waiting, setWaiting] = useState(true)
  const timers = useRef<{ delay: number; interval: number }>({
    delay: 0,
    interval: 0,
  })

  useEffect(() => {
    const current = timers.current
    window.clearTimeout(current.delay)
    window.clearInterval(current.interval)
    setPosition(0)
    setWaiting(true)
    current.delay = window.setTimeout(() => {
      setWaiting(false)
      current.interval = window.setInterval(() => {
        setPosition((value) => {
          if (value >= text.length) {
            window.clearInterval(current.interval)
            return value
          }
          return Math.min(text.length, value + STREAM_STEP)
        })
      }, STREAM_INTERVAL)
    }, reply.ttft + 300)
    return () => {
      window.clearTimeout(current.delay)
      window.clearInterval(current.interval)
    }
  }, [text, reply.ttft, runId])

  return { reply, text: text.slice(0, position), waiting }
}

export function Quickstart() {
  const { t } = useTranslation()
  const apiBase = useApiBase()
  const [snippetKey, setSnippetKey] = useState(SNIPPETS[0].key)
  const [runId, setRunId] = useState(0)
  const ref = useReveal<HTMLDivElement>()

  const snippet =
    SNIPPETS.find((item) => item.key === snippetKey) ?? SNIPPETS[0]
  const code = useMemo(
    () => snippet.code.replaceAll('{{base}}', apiBase),
    [snippet, apiBase]
  )
  const stream = usePlaygroundStream(snippet, runId)

  const selectGroup = (group: SnippetGroup) => {
    const first = SNIPPETS.find((item) => item.group === group)
    if (first) setSnippetKey(first.key)
  }

  return (
    <Section id='quickstart'>
      <div ref={ref} className='tf-reveal flex flex-col gap-10'>
        <SectionHeading
          className='max-w-[640px]'
          eyebrow={t('Quickstart')}
          title={t('Change one base_url and switch over')}
        />
        <ol className='bg-border border-border m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-px overflow-hidden rounded-xl border p-0'>
          {QUICKSTART_STEPS.map((step, index) => (
            <li
              key={step.title}
              className='bg-background flex flex-col gap-2 p-6'
            >
              <span className='text-muted-foreground font-mono text-xs'>
                0{index + 1}
              </span>
              <span className='text-foreground'>{t(step.title)}</span>
              <span className='text-muted-foreground text-[13px] leading-5'>
                {t(step.description)}
              </span>
            </li>
          ))}
        </ol>
        <Panel>
          <div className='border-border flex flex-wrap gap-1 border-b px-4 py-3'>
            <PillTabs
              aria-label={t('Integration type')}
              value={snippet.group}
              onValueChange={selectGroup}
              items={SNIPPET_GROUPS.map((group) => ({
                value: group.key,
                label: t(group.label),
              }))}
            />
          </div>
          <div className='border-border flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3'>
            <PillTabs
              size='sm'
              mono
              aria-label={t('Client')}
              value={snippet.key}
              onValueChange={setSnippetKey}
              items={SNIPPETS.filter(
                (item) => item.group === snippet.group
              ).map((item) => ({
                value: item.key,
                label: item.key,
              }))}
            />
            <div className='flex items-center gap-2'>
              <CopyButton
                value={code}
                variant='ghost'
                size='sm'
                className='font-mono text-xs'
              >
                {t('Copy')}
              </CopyButton>
              <Button
                variant='outline'
                size='sm'
                className='font-mono text-xs'
                onClick={() => setRunId((value) => value + 1)}
              >
                <Play aria-hidden='true' />
                {t('Run')}
              </Button>
            </div>
          </div>
          <div className='grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))]'>
            <pre className='text-foreground/90 border-border m-0 min-h-[300px] min-w-0 border-b p-6 font-mono text-[13px] leading-[22px] wrap-anywhere whitespace-pre-wrap md:border-r md:border-b-0'>
              {code}
            </pre>
            <div className='flex min-w-0 flex-col gap-3 p-6'>
              <div className='text-muted-foreground flex flex-wrap justify-between gap-3 font-mono text-xs leading-[18px]'>
                <span className='inline-flex items-center gap-2'>
                  <span
                    className='bg-primary size-1.5 rounded-full'
                    aria-hidden='true'
                  />
                  {stream.reply.id} · stream
                </span>
                <span>
                  {t('First-token latency')}{' '}
                  <span className='text-foreground'>{stream.reply.ttft}ms</span>{' '}
                  · {Math.round(stream.text.length * 1.3)} tokens
                </span>
              </div>
              <p
                className='text-foreground m-0 leading-7 text-pretty'
                aria-live='polite'
              >
                {stream.text}
                {stream.waiting && (
                  <span className='text-muted-foreground'>
                    {t('Waiting for the first token…')}
                  </span>
                )}
                <span
                  aria-hidden='true'
                  className='bg-foreground tf-blink ml-0.5 inline-block h-[18px] w-2 align-[-3px]'
                />
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </Section>
  )
}
