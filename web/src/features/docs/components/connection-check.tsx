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
import { Link, useSearch } from '@tanstack/react-router'
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  MinusCircle,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useDocsSampleStore } from '@/stores/docs-sample-store'

import { useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { useDocsSampleKey } from '../hooks/use-docs-sample-key'
import {
  useDocsFamilyModels,
  useDocsModelOptions,
} from '../hooks/use-docs-variables'
import { docsLangSearch } from '../lib/docs-links'
import {
  SELF_CHECK_TOOLS,
  buildProbeRequest,
  checkAddress,
  classifyFailure,
  expectedAddress,
  findSelfCheckTool,
  readErrorMessage,
  type CallFailure,
  type SelfCheckTool,
} from '../lib/self-check'
import { docsLangFromUiLanguage } from '../registry'

type StepId = 'address' | 'auth' | 'model' | 'call'
type StepStatus = 'pending' | 'running' | 'pass' | 'warn' | 'fail' | 'skip'
type StepState = { status: StepStatus; detail?: string }
type Steps = Record<StepId, StepState>

const STEP_ORDER: StepId[] = ['address', 'auth', 'model', 'call']

const STEP_TITLES: Record<StepId, string> = {
  address: 'Address format',
  auth: 'Connection and key',
  model: 'Model access',
  call: 'Test request',
}

const STATUS_ICONS: Record<
  StepStatus,
  { icon: LucideIcon; className: string }
> = {
  pending: { icon: CircleDashed, className: 'text-muted-foreground' },
  running: { icon: Loader2, className: 'text-muted-foreground animate-spin' },
  pass: {
    icon: CheckCircle2,
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  warn: {
    icon: TriangleAlert,
    className: 'text-amber-600 dark:text-amber-400',
  },
  fail: { icon: XCircle, className: 'text-destructive' },
  skip: { icon: MinusCircle, className: 'text-muted-foreground' },
}

const INITIAL_STEPS: Steps = {
  address: { status: 'pending' },
  auth: { status: 'pending' },
  model: { status: 'pending' },
  call: { status: 'pending' },
}

async function sendRequest(
  url: string,
  init: RequestInit
): Promise<{ status: number; body: unknown } | null> {
  try {
    // 直接请求网关，不走控制台的 api 实例：其 401 拦截器会把模型接口的 401 当成登录失效
    const res = await fetch(url, init)
    const text = await res.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // 非 JSON 响应按原文保留
    }
    return { status: res.status, body }
  } catch {
    return null
  }
}

function useCallFailureText() {
  const { t } = useTranslation()
  return (
    failure: CallFailure,
    status: number,
    message: string,
    tool: SelfCheckTool
  ) => {
    const params = { status, message: message || '-', tool: t(tool.label) }
    switch (failure) {
      case 'invalid-key':
        return t(
          'The key is invalid, expired or out of its own quota: {{message}}',
          params
        )
      case 'insufficient-quota':
        return t(
          'Your balance or the key quota is not enough. Top up or raise the key quota: {{message}}',
          params
        )
      case 'forbidden':
        return t(
          'Access denied. The key may not use this model or IP: {{message}}',
          params
        )
      case 'no-channel':
        return t(
          'This model has no available channel right now. Try another model or try again later: {{message}}',
          params
        )
      case 'bad-request':
        return t(
          '{{tool}} sends requests this model may not support. Try another model: {{message}}',
          params
        )
      case 'rate-limited':
        return t('Too many requests. Wait a moment and try again.')
      case 'server-error':
        return t(
          'This site or the model provider returned an error ({{status}}). Try again later; if it keeps happening, send the request id to support: {{message}}',
          params
        )
      default:
        return t('Request failed ({{status}}): {{message}}', params)
    }
  }
}

/**
 * 连接自检：按所选工具检查地址写法，再用 default 密钥依次验证连通、模型权限与一次真实调用。
 * 每一步失败都给出原因与修复方法。
 */
export function ConnectionCheck() {
  const { t, i18n } = useTranslation()
  const ids = { tool: useId(), address: useId(), model: useId() }
  const search = useSearch({ strict: false }) as { tool?: string }
  const signedIn = useAuthStore((state) => Boolean(state.auth.user))
  const key = useDocsSampleStore((state) => state.key)
  const keyState = useDocsSampleKey(signedIn)
  const baseUrl = useDocsBaseUrl()
  const familyModels = useDocsFamilyModels()
  const modelOptions = useDocsModelOptions()
  const failureText = useCallFailureText()
  const lang = docsLangFromUiLanguage(i18n.resolvedLanguage || i18n.language)

  const [toolId, setToolId] = useState(() => findSelfCheckTool(search.tool).id)
  const tool = findSelfCheckTool(toolId)
  const [address, setAddress] = useState('')
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  const model = modelOverride ?? familyModels[tool.family]
  const [steps, setSteps] = useState<Steps>(INITIAL_STEPS)
  const [running, setRunning] = useState(false)

  const expected = expectedAddress(baseUrl, tool.address)
  const toolItems = useMemo(
    () =>
      SELF_CHECK_TOOLS.map((item) => ({
        value: item.id,
        label: t(item.label),
      })),
    [t]
  )
  const modelItems = useMemo(
    () => modelOptions.map((name) => ({ value: name, label: name })),
    [modelOptions]
  )

  const update = (id: StepId, state: StepState) =>
    setSteps((previous) => ({ ...previous, [id]: state }))

  const runAddressCheck = () => {
    const params = { tool: t(tool.label), expected }
    const issue = checkAddress(address, baseUrl, tool.address)
    const messages: Record<typeof issue, [StepStatus, string]> = {
      ok: ['pass', t('The address matches what {{tool}} expects.', params)],
      empty: [
        'skip',
        t('Not filled in. {{tool}} expects: {{expected}}', params),
      ],
      invalid: [
        'fail',
        t(
          'This is not a valid address. {{tool}} expects: {{expected}}',
          params
        ),
      ],
      'other-host': [
        'fail',
        t(
          'This address does not point to this site. Use: {{expected}}',
          params
        ),
      ],
      scheme: [
        'warn',
        t('http and https do not match this site. Use: {{expected}}', params),
      ],
      'extra-v1': [
        'fail',
        t(
          '{{tool}} adds /v1 by itself. Remove /v1 from the end: {{expected}}',
          params
        ),
      ],
      'missing-v1': [
        'fail',
        t('{{tool}} needs /v1 at the end: {{expected}}', params),
      ],
      'full-path': [
        'fail',
        t(
          'Enter the base address, not the full endpoint path: {{expected}}',
          params
        ),
      ],
      'unexpected-path': [
        'fail',
        t('The path does not look right. Use: {{expected}}', params),
      ],
    }
    const [status, detail] = messages[issue]
    update('address', { status, detail })
  }

  const run = async () => {
    if (!key) return
    setRunning(true)
    setSteps({
      address: { status: 'running' },
      auth: { status: 'pending' },
      model: { status: 'pending' },
      call: { status: 'pending' },
    })
    runAddressCheck()

    const skipped = {
      status: 'skip' as const,
      detail: t('Skipped because a previous step failed.'),
    }
    update('auth', { status: 'running' })
    const models = await sendRequest(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${key.value}` },
    })
    if (!models) {
      update('auth', {
        status: 'fail',
        detail: t(
          'Could not reach this site. Check your network or proxy settings.'
        ),
      })
      setSteps((previous) => ({ ...previous, model: skipped, call: skipped }))
      setRunning(false)
      return
    }
    if (models.status !== 200) {
      const failure = classifyFailure(models.status, models.body)
      update('auth', {
        status: 'fail',
        detail: failureText(
          failure,
          models.status,
          readErrorMessage(models.body),
          tool
        ),
      })
      setSteps((previous) => ({ ...previous, model: skipped, call: skipped }))
      setRunning(false)
      return
    }
    const available = (
      (models.body as { data?: { id?: string }[] })?.data ?? []
    )
      .map((item) => item.id)
      .filter(Boolean) as string[]
    update('auth', {
      status: 'pass',
      detail: t('Connected. Your key can use {{count}} models.', {
        count: available.length,
      }),
    })

    update('model', { status: 'running' })
    if (!available.includes(model)) {
      const notAvailable = t(
        '{{model}} is not available to your key. Check the model name, the key group and its model limits.',
        { model }
      )
      const usable = available.length
        ? t('Models your key can use: {{models}}', {
            models: available.slice(0, 8).join(', '),
          })
        : ''
      update('model', {
        status: 'fail',
        detail: usable ? `${notAvailable} ${usable}` : notAvailable,
      })
      update('call', skipped)
      setRunning(false)
      return
    }
    update('model', {
      status: 'pass',
      detail: t('{{model}} is available to your key.', { model }),
    })

    update('call', { status: 'running' })
    const probe = buildProbeRequest(baseUrl, tool.protocol, key.value, model)
    const result = await sendRequest(probe.url, probe.init)
    if (!result) {
      update('call', {
        status: 'fail',
        detail: t(
          'Could not reach this site. Check your network or proxy settings.'
        ),
      })
    } else if (result.status >= 200 && result.status < 300) {
      update('call', {
        status: 'pass',
        detail: t('The model replied. These settings work in {{tool}}.', {
          tool: t(tool.label),
        }),
      })
    } else {
      const failure = classifyFailure(result.status, result.body)
      update('call', {
        status: 'fail',
        detail: failureText(
          failure,
          result.status,
          readErrorMessage(result.body),
          tool
        ),
      })
    }
    setRunning(false)
  }

  const hasFailure = STEP_ORDER.some((id) => steps[id].status === 'fail')

  let blocker = null
  if (!signedIn) {
    blocker = (
      <Link
        to='/sign-in'
        className='text-foreground underline underline-offset-4'
      >
        {t('Sign in to run the check with your key.')}
      </Link>
    )
  } else if (keyState.missing) {
    blocker = (
      <Link to='/keys' className='text-foreground underline underline-offset-4'>
        {t('Create an API key first to fill it into the samples.')}
      </Link>
    )
  }

  return (
    <section className='docs-block border-border/60 space-y-4 rounded-lg border p-4'>
      <div className='grid gap-3 sm:grid-cols-3'>
        <div className='min-w-0 space-y-1.5'>
          <Label htmlFor={ids.tool} className='text-muted-foreground text-xs'>
            {t('Tool')}
          </Label>
          <Select
            items={toolItems}
            value={tool.id}
            onValueChange={(value) => {
              if (!value) return
              setToolId(String(value))
              setModelOverride(null)
              setSteps(INITIAL_STEPS)
            }}
          >
            <SelectTrigger id={ids.tool} className='h-8 w-full text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {toolItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='min-w-0 space-y-1.5'>
          <Label
            htmlFor={ids.address}
            className='text-muted-foreground text-xs'
          >
            {t('Address you entered in the tool')}
          </Label>
          <Input
            id={ids.address}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={expected}
            className='h-8 font-mono text-xs'
          />
        </div>
        <div className='min-w-0 space-y-1.5'>
          <Label htmlFor={ids.model} className='text-muted-foreground text-xs'>
            {t('Model')}
          </Label>
          <Combobox
            id={ids.model}
            options={modelItems}
            value={model}
            onValueChange={(value) => value && setModelOverride(value)}
            allowCustomValue
            placeholder={t('Select or enter model name')}
            className='h-8 text-xs'
          />
        </div>
      </div>

      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-muted-foreground text-xs leading-5'>
          {blocker ??
            t(
              'The check uses your default key and sends one tiny real request, which costs a negligible amount of balance.'
            )}
        </p>
        <Button
          size='sm'
          className='shrink-0'
          disabled={!key || running || Boolean(blocker)}
          onClick={() => void run()}
        >
          {running ? t('Checking...') : t('Run check')}
        </Button>
      </div>

      <ol className='space-y-3' aria-live='polite'>
        {STEP_ORDER.map((id, index) => {
          const state = steps[id]
          const icon = STATUS_ICONS[state.status]
          const Icon = icon.icon
          return (
            <li key={id} className='flex gap-3'>
              <Icon
                className={cn('mt-0.5 size-4 shrink-0', icon.className)}
                aria-hidden='true'
              />
              <div className='min-w-0 flex-1'>
                <div className='text-foreground text-sm font-medium'>
                  {index + 1}. {t(STEP_TITLES[id])}
                </div>
                {state.detail && (
                  <p className='text-muted-foreground mt-0.5 text-xs leading-5 break-words'>
                    {state.detail}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {hasFailure && (
        <p className='text-xs'>
          <Link
            to='/docs/$slug'
            params={{ slug: tool.guide }}
            search={docsLangSearch(lang)}
            className='text-foreground underline underline-offset-4'
          >
            {t('Open the {{tool}} guide', { tool: t(tool.label) })}
          </Link>
        </p>
      )}
    </section>
  )
}
