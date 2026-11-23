import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { PublicLayout } from '@/components/layout'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PeriodFilter } from '@/features/finance/components/period-filter'
import { useFinanceDateRange } from '@/features/finance/hooks/use-finance-date-range'
import {
  dayRangeToTimestamps,
  presetRange,
  type DatePresetId,
} from '@/features/finance/lib/date-presets'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import {
  getKeyEmployeeInfo,
  getKeyModels,
  getKeyTokenUsage,
  getKeyUsageLogs,
  KeyUsageError,
  normalizeApiKey,
} from './api'
import {
  EmployeeCard,
  EmployeeCardPlaceholder,
} from './components/employee-card'
import { KeyLogsTable } from './components/key-logs-table'
import { KeySummary } from './components/key-summary'

const ALL_MODELS = '__all__'
const PAGE_SIZE = 20

const route = getRouteApi('/key-usage')

/** 查询失败的提示：401 key 无效，429 限流，其余按服务端消息或通用错误 */
function keyUsageErrorMessage(
  error: unknown,
  t: (key: string) => string
): string {
  if (error instanceof KeyUsageError) {
    if (error.status === 401) return t('The API key is invalid or disabled')
    if (error.status === 429) {
      return t('Too many queries, please try again later')
    }
    if (error.message && !/^\d+$/.test(error.message)) return t(error.message)
  }
  return t('Query failed, please try again later')
}

/**
 * 公开的 API 密钥用量查询（TokenFunc 二开）：粘贴 key 查看额度、企业归属与调用记录。
 * key 只保存在页面内存里，不进 URL、不落浏览器存储；筛选与页码同步在 URL。
 */
export function KeyUsagePage() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const queryClient = useQueryClient()
  const [draftKey, setDraftKey] = useState('')
  const [apiKey, setApiKey] = useState('')
  const enabled = apiKey !== ''
  // 进入页面时定下默认区间，重置时草稿与 URL 回退值保持一致
  const [defaultRange] = useState(() => presetRange('last30'))

  const range = useFinanceDateRange({
    search,
    navigate,
    startKey: 'start',
    endKey: 'end',
    fallback: defaultRange,
    resetKeys: ['page'],
  })
  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: { defaultPage: 1, defaultPageSize: PAGE_SIZE },
      globalFilter: { enabled: false },
    })
  const model = search.model ?? ''
  const timestamps = dayRangeToTimestamps(range.applied)
  // 模型放在「查询」左侧，与日期一样先改草稿，点「查询」才生效
  const [modelDraft, setModelDraft] = useState(model)
  useEffect(() => {
    setModelDraft(model)
  }, [model])

  const usage = useQuery({
    queryKey: ['key-usage', 'token', apiKey],
    queryFn: ({ signal }) => getKeyTokenUsage(apiKey, signal),
    enabled,
    retry: false,
    // 错误在页面内展示，不弹全局 toast
    meta: { errorToast: false },
  })
  // 额度查询通过（key 有效）后再查其余三项，无效 key 只消耗一次限流
  const keyValid = enabled && usage.isSuccess
  const employee = useQuery({
    queryKey: ['key-usage', 'employee', apiKey],
    queryFn: ({ signal }) => getKeyEmployeeInfo(apiKey, signal),
    enabled: keyValid,
    retry: false,
    meta: { errorToast: false },
  })
  const models = useQuery({
    queryKey: ['key-usage', 'models', apiKey],
    queryFn: ({ signal }) => getKeyModels(apiKey, signal),
    enabled: keyValid,
    retry: false,
    meta: { errorToast: false },
  })
  const logs = useQuery({
    queryKey: [
      'key-usage',
      'logs',
      apiKey,
      timestamps.ts_start,
      timestamps.ts_end,
      model,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: ({ signal }) =>
      getKeyUsageLogs(
        apiKey,
        {
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
          startTimestamp: timestamps.ts_start,
          endTimestamp: timestamps.ts_end,
          model: model || undefined,
        },
        signal
      ),
    enabled: keyValid,
    retry: false,
    meta: { errorToast: false },
    placeholderData: (previous) => previous,
  })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const nextKey = normalizeApiKey(draftKey)
    // 同一把 key 再点查询：刷新数据而不是什么都不做
    if (nextKey === apiKey) {
      void queryClient.invalidateQueries({ queryKey: ['key-usage'] })
      return
    }
    setApiKey(nextKey)
  }
  const clear = () => {
    setDraftKey('')
    setApiKey('')
  }
  const applyPreset = (preset: DatePresetId) => {
    range.applyRange(presetRange(preset))
  }
  // 日期与模型一次写入 URL，避免两次 navigate 互相覆盖
  const applyFilters = () => {
    const draft = range.draft
    if (!draft.start || !draft.end || draft.start > draft.end) return
    navigate({
      search: (previous) => ({
        ...previous,
        start: draft.start,
        end: draft.end,
        model: modelDraft || undefined,
        page: undefined,
      }),
    })
  }
  const resetFilters = () => {
    range.setDraft(defaultRange)
    setModelDraft('')
    navigate({
      search: (previous) => ({
        ...previous,
        start: undefined,
        end: undefined,
        model: undefined,
        page: undefined,
      }),
    })
  }

  // 可用模型会随 key 的模型限制变化，历史记录里可能有已不可用的模型：并上本月常用模型、当前页出现的模型与已选模型
  const modelNames = new Set([
    ...(models.data ?? []),
    ...(employee.data?.top_models ?? []).map((item) => item.model),
    ...(logs.data?.items ?? []).map((item) => item.model_name),
    ...(model ? [model] : []),
    ...(modelDraft ? [modelDraft] : []),
  ])
  const modelOptions = [
    { value: ALL_MODELS, label: t('All models') },
    ...[...modelNames]
      .filter(Boolean)
      .sort()
      .map((name) => ({ value: name, label: name })),
  ]

  return (
    <PublicLayout>
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-6 py-6'>
        <div className='flex flex-col gap-2'>
          <h1 className='text-2xl font-semibold'>{t('API key usage')}</h1>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Paste an API key to see its quota, usage and call records. The key is only sent in the request header and is not stored.'
            )}
          </p>
        </div>

        <form onSubmit={submit} className='flex flex-col gap-2 sm:flex-row'>
          <PasswordInput
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder='sk-...'
            aria-label={t('API key')}
            autoComplete='off'
            className='font-mono sm:flex-1'
          />
          <div className='flex gap-2'>
            <Button type='submit' disabled={!normalizeApiKey(draftKey)}>
              {t('Query')}
            </Button>
            {enabled && (
              <Button type='button' variant='outline' onClick={clear}>
                {t('Clear')}
              </Button>
            )}
          </div>
        </form>

        {enabled && usage.isError ? (
          <ErrorState
            title={keyUsageErrorMessage(usage.error, t)}
            onRetry={() => void usage.refetch()}
          />
        ) : (
          <>
            <KeySummary
              usage={usage.data}
              models={models.data ?? []}
              loading={enabled && usage.isLoading}
            />
            {!enabled && <EmployeeCardPlaceholder />}
            {employee.data && <EmployeeCard info={employee.data} />}
            <div className='flex flex-col gap-3'>
              <h2 className='text-lg font-semibold'>{t('Call records')}</h2>
              {logs.isError ? (
                <ErrorState
                  title={keyUsageErrorMessage(logs.error, t)}
                  onRetry={() => void logs.refetch()}
                />
              ) : (
                <KeyLogsTable
                  logs={logs.data?.items ?? []}
                  total={logs.data?.total ?? 0}
                  loading={keyValid && logs.isLoading}
                  fetching={logs.isFetching}
                  pagination={pagination}
                  onPaginationChange={onPaginationChange}
                  ensurePageInRange={ensurePageInRange}
                  emptyTitle={
                    enabled
                      ? undefined
                      : t('Call records will appear after you query a key')
                  }
                  emptyDescription={
                    enabled
                      ? undefined
                      : t(
                          'Each record shows the time, model, input and output tokens, cost and duration'
                        )
                  }
                  toolbar={
                    <PeriodFilter
                      range={range}
                      presets={['today', 'week', 'month', 'last30']}
                      onPreset={applyPreset}
                      onApply={applyFilters}
                      onReset={resetFilters}
                      disabled={!keyValid}
                    >
                      <Select
                        items={modelOptions}
                        value={modelDraft || ALL_MODELS}
                        onValueChange={(value) =>
                          value !== null &&
                          setModelDraft(
                            value === ALL_MODELS ? '' : String(value)
                          )
                        }
                        disabled={!keyValid}
                      >
                        <SelectTrigger
                          aria-label={t('Model')}
                          className='w-full md:w-56'
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {modelOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </PeriodFilter>
                  }
                />
              )}
            </div>
          </>
        )}
      </div>
    </PublicLayout>
  )
}
