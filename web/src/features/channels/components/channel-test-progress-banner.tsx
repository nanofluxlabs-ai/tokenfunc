import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

import { getSystemTaskProgress } from '../api'
import { channelsQueryKeys } from '../lib'
import { useChannels } from './channels-provider'

const PROGRESS_POLL_INTERVAL_MS = 3000

/** 「测试所有渠道」进度横幅（TokenFunc 二开）：轮询系统任务，完成后刷新列表并收起 */
export function ChannelTestProgressBanner() {
  const { t } = useTranslation()
  const { testTaskId, setTestTaskId } = useChannels()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['channel-test-task', testTaskId],
    queryFn: () => getSystemTaskProgress(testTaskId as string),
    enabled: Boolean(testTaskId),
    refetchInterval: (result) => {
      const status = result.state.data?.data?.status
      if (status === 'succeeded' || status === 'failed') {
        return false
      }
      return PROGRESS_POLL_INTERVAL_MS
    },
    retry: false,
    meta: { errorToast: false },
  })

  const task = query.data?.data
  const status = task?.status
  const finished = status === 'succeeded' || status === 'failed'

  useEffect(() => {
    if (!finished) {
      return
    }
    void queryClient.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
  }, [finished, queryClient])

  useEffect(() => {
    // 非 Root 读不到系统任务（接口返回失败），直接收起，不打扰
    if (query.isError || (query.data && !query.data.success)) {
      setTestTaskId(null)
    }
  }, [query.isError, query.data, setTestTaskId])

  if (!testTaskId) {
    return null
  }

  const total = task?.state?.total ?? 0
  const processed = task?.state?.processed ?? 0
  const percent =
    task?.state?.progress ??
    (total > 0 ? Math.round((processed / total) * 100) : 0)

  let message = t('Testing all channels…')
  if (status === 'succeeded') {
    message = t('All channel tests finished.')
  } else if (status === 'failed') {
    message = t('Channel test task failed.')
  }

  return (
    <div
      role='status'
      aria-live='polite'
      className='border-border bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2 text-sm'
    >
      {!finished && (
        <Loader2 className='text-muted-foreground h-4 w-4 animate-spin' />
      )}
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <div className='flex items-center justify-between gap-2'>
          <span className='truncate'>{message}</span>
          {total > 0 && (
            <span className='text-muted-foreground shrink-0 text-xs'>
              {processed} / {total}
            </span>
          )}
        </div>
        {!finished && <Progress value={percent} className='h-1.5' />}
        {status === 'failed' && task?.error && (
          <span className='text-destructive truncate text-xs'>
            {task.error}
          </span>
        )}
      </div>
      <Button
        variant='ghost'
        size='icon'
        className='size-7 shrink-0'
        aria-label={t('Dismiss')}
        onClick={() => setTestTaskId(null)}
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  )
}
