import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ChannelTestProgressBanner } from '../channel-test-progress-banner'
import { ChannelsProvider, useChannels } from '../channels-provider'

/** 测试里没有「测试所有渠道」按钮，挂载时直接把任务 id 写进 provider */
function TrackTask(props: { taskId: string }) {
  const { setTestTaskId } = useChannels()
  useEffect(() => {
    setTestTaskId(props.taskId)
  }, [props.taskId, setTestTaskId])
  return null
}

function renderBanner(taskId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ChannelsProvider>
        <TrackTask taskId={taskId} />
        <ChannelTestProgressBanner />
      </ChannelsProvider>
    </QueryClientProvider>
  )
  return queryClient
}

function taskResponse(
  status: 'running' | 'succeeded' | 'failed',
  state: { total: number; processed: number; progress: number },
  error = ''
) {
  return {
    data: {
      success: true,
      data: { task_id: 'task-1', type: 'channel_test', status, state, error },
    },
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ChannelTestProgressBanner', () => {
  it('shows processed/total while running and invalidates the channel list once the task finishes', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce(
        taskResponse('running', { total: 10, processed: 4, progress: 40 })
      )
      .mockResolvedValue(
        taskResponse('succeeded', { total: 10, processed: 10, progress: 100 })
      )
    const queryClient = renderBanner('task-1')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    expect(await screen.findByText('4 / 10')).toBeInTheDocument()
    expect(screen.getByText('Testing all channels…')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(
      '/api/system-task/task-1',
      expect.objectContaining({ disableDuplicate: true })
    )

    await queryClient.refetchQueries({ queryKey: ['channel-test-task'] })

    expect(
      await screen.findByText('All channel tests finished.')
    ).toBeInTheDocument()
    await waitFor(() => expect(invalidate).toHaveBeenCalled())
  })

  it('can be dismissed by the user', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      taskResponse('running', { total: 3, processed: 1, progress: 33 })
    )
    renderBanner('task-1')
    const user = userEvent.setup()

    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('hides itself when the task cannot be read (non-root admin)', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: false, message: 'forbidden' },
    })
    renderBanner('task-1')

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})
