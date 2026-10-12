import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { channelSchema, type Channel } from '../../types'
import { ChannelHealthBadges } from '../channel-health-badges'

function channel(overrides: Record<string, unknown> = {}): Channel {
  return channelSchema.parse({
    id: 1,
    type: 1,
    key: '',
    name: 'relay',
    status: 1,
    created_time: 0,
    test_time: 0,
    response_time: 0,
    balance_updated_time: 0,
    ...overrides,
  })
}

afterEach(() => {
  cleanup()
})

describe('ChannelHealthBadges', () => {
  it('renders nothing for a channel that is not external', () => {
    const { container } = render(
      <ChannelHealthBadges
        channel={channel({
          is_external: false,
          health_state: { channel_id: 1, api_health: 'failed' },
        })}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows only the external badge when the channel was never probed', () => {
    render(<ChannelHealthBadges channel={channel({ is_external: true })} />)
    expect(screen.getByText('External')).toBeInTheDocument()
    expect(screen.queryByText(/API/)).toBeNull()
    expect(screen.queryByText(/Inference/)).toBeNull()
  })

  it('marks a failed api dimension with a down arrow and keeps unknown inference hidden', () => {
    render(
      <ChannelHealthBadges
        channel={channel({
          is_external: true,
          health_state: {
            channel_id: 1,
            api_health: 'failed',
            inference_health: 'unknown',
            api_fail_count: 3,
          },
        })}
      />
    )
    expect(screen.getByText('API ↓')).toBeInTheDocument()
    expect(screen.getByLabelText('API unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/Inference/)).toBeNull()
  })

  it('shows both dimensions as up arrows when healthy', () => {
    render(
      <ChannelHealthBadges
        channel={channel({
          is_external: true,
          health_state: {
            channel_id: 1,
            api_health: 'ok',
            inference_health: 'ok',
          },
        })}
      />
    )
    expect(screen.getByText('API ↑')).toBeInTheDocument()
    expect(screen.getByText('Inference ↑')).toBeInTheDocument()
    expect(screen.getByLabelText('Inference available')).toBeInTheDocument()
  })
})
