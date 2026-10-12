import { describe, expect, it } from 'vitest'

import type { ChannelHealthState } from '../../types'
import {
  isDispatchPaused,
  isExternalChannel,
  pausedHealthDimensions,
} from '../channel-health'

function state(
  overrides: Partial<ChannelHealthState> = {}
): ChannelHealthState {
  return {
    channel_id: 1,
    api_health: 'unknown',
    inference_health: 'unknown',
    api_fail_count: 0,
    inference_fail_count: 0,
    last_api_probe_at: 0,
    last_inference_probe_at: 0,
    last_api_error: '',
    last_inference_error: '',
    updated_at: 0,
    dispatch_paused: false,
    ...overrides,
  }
}

describe('isExternalChannel', () => {
  it('treats only an explicit true flag as external', () => {
    expect(isExternalChannel({ is_external: true })).toBe(true)
    expect(isExternalChannel({ is_external: false })).toBe(false)
    expect(isExternalChannel({ is_external: null })).toBe(false)
    expect(isExternalChannel({})).toBe(false)
  })
})

describe('isDispatchPaused', () => {
  it('never pauses a non-external channel even with a failed state', () => {
    expect(
      isDispatchPaused({
        is_external: false,
        health_state: state({ api_health: 'failed', dispatch_paused: true }),
      })
    ).toBe(false)
  })

  it('pauses when either dimension failed or the server already derived it', () => {
    expect(
      isDispatchPaused({
        is_external: true,
        health_state: state({ api_health: 'failed' }),
      })
    ).toBe(true)
    expect(
      isDispatchPaused({
        is_external: true,
        health_state: state({ inference_health: 'failed' }),
      })
    ).toBe(true)
    expect(
      isDispatchPaused({
        is_external: true,
        health_state: state({ dispatch_paused: true }),
      })
    ).toBe(true)
  })

  it('does not pause an external channel without a state or with healthy dimensions', () => {
    expect(isDispatchPaused({ is_external: true, health_state: null })).toBe(
      false
    )
    expect(
      isDispatchPaused({
        is_external: true,
        health_state: state({ api_health: 'ok', inference_health: 'ok' }),
      })
    ).toBe(false)
  })
})

describe('pausedHealthDimensions', () => {
  it('lists failed dimensions in api-then-inference order', () => {
    expect(pausedHealthDimensions(null)).toEqual([])
    expect(pausedHealthDimensions(state())).toEqual([])
    expect(
      pausedHealthDimensions(
        state({ api_health: 'failed', inference_health: 'failed' })
      )
    ).toEqual(['api', 'inference'])
    expect(
      pausedHealthDimensions(state({ inference_health: 'failed' }))
    ).toEqual(['inference'])
  })
})
