import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

import {
  SELF_CHECK_MODELS,
  SELF_CHECK_STEPS,
  SELF_CHECK_TIMING,
} from '../../content'
import { Eyebrow, Panel, PillTabs } from '../landing-primitives'

const TOTAL = SELF_CHECK_STEPS.length

/**
 * 真模型：模拟控制台里的「模型自检」（演示，不发请求）。
 * 挂载即开始，四步逐项点亮，完成后停留再自动切到下一个厂商循环；
 * 点击厂商 Tab 从该厂商重新开始；减弱动效下直接显示 4/4 通过、不轮换。
 */
export function SelfCheckDemo() {
  const { t } = useTranslation()
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [modelIndex, setModelIndex] = useState(0)
  // 每次（重新）开始检测都换一个 runId，点击当前 Tab 也能重跑
  const [runId, setRunId] = useState(0)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (reduced) {
      setStep(TOTAL)
      return
    }
    setStep(0)
    let current = 0
    let holdTimer = 0
    const stepTimer = window.setInterval(() => {
      current += 1
      setStep(current)
      if (current < TOTAL) return
      window.clearInterval(stepTimer)
      holdTimer = window.setTimeout(() => {
        setModelIndex((index) => (index + 1) % SELF_CHECK_MODELS.length)
        setRunId((value) => value + 1)
      }, SELF_CHECK_TIMING.hold)
    }, SELF_CHECK_TIMING.step)
    return () => {
      window.clearInterval(stepTimer)
      window.clearTimeout(holdTimer)
    }
  }, [modelIndex, runId, reduced])

  const model = SELF_CHECK_MODELS[modelIndex]
  const done = step >= TOTAL
  const summary = done
    ? t('{{count}}/{{total}} passed', { count: TOTAL, total: TOTAL })
    : t('Checking {{count}}/{{total}}', { count: step, total: TOTAL })

  const selectModel = (key: string) => {
    const index = SELF_CHECK_MODELS.findIndex((item) => item.key === key)
    if (index < 0) return
    setModelIndex(index)
    setRunId((value) => value + 1)
  }

  return (
    <Panel className='flex flex-col gap-5 p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Eyebrow>{t('Model self-check')}</Eyebrow>
        <PillTabs
          size='sm'
          aria-label={t('Model to check')}
          value={model.key}
          onValueChange={selectModel}
          items={SELF_CHECK_MODELS.map((item) => ({
            value: item.key,
            label: item.label,
          }))}
        />
      </div>
      <ol className='border-border m-0 flex list-none flex-col border-t p-0'>
        {SELF_CHECK_STEPS.map((label, index) => {
          const passed = step > index
          const running = !passed && step === index
          let status = t('Awaiting check')
          let state = 'pending'
          if (passed) {
            status = t('Passed')
            state = 'passed'
          } else if (running) {
            status = t('Checking…')
            state = 'running'
          }
          return (
            <li
              key={label}
              data-state={state}
              className='border-border grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-b py-4'
            >
              <span
                aria-hidden='true'
                className={cn(
                  'flex size-[22px] items-center justify-center rounded-full border transition-all duration-200',
                  passed && 'border-primary/40 bg-primary/10',
                  running && 'border-foreground/50',
                  !passed && !running && 'border-input'
                )}
              >
                <Check
                  className={cn(
                    'size-3',
                    passed ? 'text-brand-ink' : 'text-transparent'
                  )}
                />
              </span>
              <span
                className={cn(
                  'text-sm transition-colors duration-200',
                  passed || running
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {t(label)}
              </span>
              <span
                className={cn(
                  'font-mono text-xs whitespace-nowrap',
                  passed && 'text-brand-ink',
                  running && 'text-foreground/90',
                  !passed && !running && 'text-muted-foreground'
                )}
              >
                {status}
              </span>
            </li>
          )
        })}
      </ol>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <span
          className={cn(
            'font-mono text-[13px]',
            done ? 'text-brand-ink' : 'text-muted-foreground'
          )}
          aria-live='polite'
        >
          {model.id} · {summary}
        </span>
        <span className='text-muted-foreground font-mono text-xs'>
          {t('Channel groups · sources labeled')}
        </span>
      </div>
    </Panel>
  )
}
