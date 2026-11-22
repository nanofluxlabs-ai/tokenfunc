import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { QUICKSTART_STEPS, SNIPPETS } from '../content'
import { useReveal } from '../hooks/use-reveal'
import { Eyebrow, PillTabs } from './landing-primitives'

/** 「已复制」保持时长 */
const COPIED_RESET_MS = 1600

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

function QuickstartSteps() {
  const { t } = useTranslation()
  return (
    <ol className='border-border m-0 flex list-none flex-col border-l p-0'>
      {QUICKSTART_STEPS.map((step, index) => {
        // 第 02 步（替换 base_url）是唯一改动，节点与序号高亮
        const active = index === 1
        return (
          <li
            key={step.title}
            className='relative flex flex-col gap-1 pb-6 pl-6 last:pb-0'
          >
            <span
              aria-hidden='true'
              className={cn(
                'absolute top-1.5 -left-[5px] size-[9px] rounded-full border',
                active
                  ? 'bg-primary border-primary'
                  : 'bg-background border-foreground/50'
              )}
            />
            <span
              className={cn(
                'font-mono text-xs',
                active ? 'text-brand-ink' : 'text-muted-foreground'
              )}
            >
              0{index + 1}
            </span>
            <span className='text-foreground text-base'>{t(step.title)}</span>
            <span className='text-muted-foreground text-[13px] leading-5'>
              {t(step.description)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** 接入：左侧三步竖排，右侧代码块（含 API 地址的那一行高亮） */
export function Quickstart() {
  const { t } = useTranslation()
  const apiBase = useApiBase()
  const [snippetKey, setSnippetKey] = useState(SNIPPETS[0].key)
  const { copiedText, copyToClipboard } = useCopyToClipboard({
    notify: false,
    resetAfterMs: COPIED_RESET_MS,
  })
  const ref = useReveal<HTMLDivElement>()

  const snippet =
    SNIPPETS.find((item) => item.key === snippetKey) ?? SNIPPETS[0]
  const code = useMemo(
    () => snippet.code.replaceAll('{{base}}', apiBase),
    [snippet, apiBase]
  )
  // 行号在拆行时生成，作为每行稳定的 key
  const lines = code
    .split('\n')
    .map((text, index) => ({ number: index + 1, text }))
  const copied = copiedText === code

  return (
    <section id='quickstart' className='border-border scroll-mt-16 border-t'>
      <div
        ref={ref}
        className='tf-reveal mx-auto flex max-w-[1200px] flex-wrap items-start gap-[clamp(40px,5vw,64px)] px-[clamp(20px,5vw,32px)] py-[clamp(72px,9vw,112px)]'
      >
        <div className='flex min-w-0 flex-[1_1_300px] flex-col gap-8'>
          <div className='flex flex-col gap-4'>
            <Eyebrow>{t('Quickstart')}</Eyebrow>
            <h2 className='text-foreground m-0 text-[clamp(28px,3.4vw,36px)] leading-[1.2] font-medium tracking-[-0.02em]'>
              {t('Change one line of base_url to switch')}
            </h2>
          </div>
          <QuickstartSteps />
          <Link
            to='/docs'
            className='text-foreground/90 hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm'
          >
            {t('More SDKs and agent setups')}
            <ArrowRight className='size-3.5' aria-hidden='true' />
            {t('Docs')}
          </Link>
        </div>

        <div className='bg-card border-border min-w-0 flex-[1.7_1_460px] overflow-hidden rounded-xl border'>
          <div className='border-border bg-muted/40 flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2.5'>
            <PillTabs
              size='sm'
              mono
              aria-label={t('Language')}
              value={snippet.key}
              onValueChange={setSnippetKey}
              items={SNIPPETS.map((item) => ({
                value: item.key,
                label: item.key,
              }))}
            />
            <Button
              variant='ghost'
              size='sm'
              className='h-[30px] rounded-full px-3 font-mono text-xs whitespace-nowrap'
              onClick={() => void copyToClipboard(code)}
            >
              {copied ? (
                <Check className='text-brand-ink size-3' aria-hidden='true' />
              ) : (
                <Copy className='size-3' aria-hidden='true' />
              )}
              <span aria-live='polite'>{copied ? t('Copied') : t('Copy')}</span>
            </Button>
          </div>
          <div className='overflow-x-auto py-4'>
            <pre className='m-0 min-w-max font-mono text-[13px] leading-[22px]'>
              <code className='block'>
                {lines.map((line) => {
                  const highlighted = line.text.includes(apiBase)
                  return (
                    <span
                      key={line.number}
                      data-highlighted={highlighted || undefined}
                      className={cn(
                        'grid grid-cols-[44px_auto] pr-6',
                        highlighted &&
                          'bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]'
                      )}
                    >
                      <span
                        aria-hidden='true'
                        className='text-muted-foreground pr-4 text-right select-none'
                      >
                        {line.number}
                      </span>
                      <span
                        className={cn(
                          'whitespace-pre',
                          highlighted ? 'text-foreground' : 'text-foreground/90'
                        )}
                      >
                        {line.text || ' '}
                      </span>
                    </span>
                  )
                })}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
