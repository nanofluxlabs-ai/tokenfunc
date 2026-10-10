import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SELF_CHECK_MODELS, SELF_CHECK_STEPS } from '../../content'
import { Eyebrow, Panel, PillTabs } from '../landing-primitives'

const STEP_INTERVAL = 650

/** 真模型不掺假：模拟控制台里的"模型自检"动画（演示，不发请求） */
export function SelfCheckDemo() {
  const { t } = useTranslation()
  const [modelKey, setModelKey] = useState(SELF_CHECK_MODELS[0].key)
  const [step, setStep] = useState(-1)
  const timer = useRef<number>(0)

  useEffect(() => () => window.clearInterval(timer.current), [])

  const run = (key = modelKey) => {
    window.clearInterval(timer.current)
    setModelKey(key)
    setStep(0)
    timer.current = window.setInterval(() => {
      setStep((current) => {
        if (current >= SELF_CHECK_STEPS.length) {
          window.clearInterval(timer.current)
          return current
        }
        return current + 1
      })
    }, STEP_INTERVAL)
  }

  const model =
    SELF_CHECK_MODELS.find((item) => item.key === modelKey) ??
    SELF_CHECK_MODELS[0]
  const done = step >= SELF_CHECK_STEPS.length
  const total = SELF_CHECK_STEPS.length
  let summary = t('Pick a model to start the check')
  if (done) {
    summary = `${model.id} · ${t('{{count}}/{{total}} passed', { count: total, total })}`
  } else if (step >= 0) {
    summary = `${t('Checking')} · ${step}/${total}`
  }

  return (
    <Panel className='flex flex-col gap-5 p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Eyebrow>{t('Model self-check')}</Eyebrow>
        <PillTabs
          size='sm'
          mono
          aria-label={t('Model to check')}
          value={modelKey}
          onValueChange={run}
          items={SELF_CHECK_MODELS.map((item) => ({
            value: item.key,
            label: item.id,
          }))}
        />
      </div>
      <ol className='border-border m-0 flex list-none flex-col border-t p-0'>
        {SELF_CHECK_STEPS.map((label, index) => {
          const passed = step > index
          const running = step === index
          let status = t('Pending')
          if (passed) status = t('Passed')
          else if (running) status = t('Checking…')
          return (
            <li
              key={label}
              className='border-border flex items-center justify-between gap-4 border-b py-3.5'
            >
              <span
                className={cn(
                  'text-sm transition-colors',
                  passed || running
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {t(label, { context: model.context })}
              </span>
              <span
                className={cn(
                  'font-mono text-xs whitespace-nowrap',
                  passed && 'text-brand-ink',
                  running && 'text-foreground/90',
                  !passed && !running && 'text-muted-foreground/70'
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
          {summary}
        </span>
        <Button size='sm' className='h-10 px-4 text-sm' onClick={() => run()}>
          {done ? t('Run again') : t('Start check')}
        </Button>
      </div>
    </Panel>
  )
}
