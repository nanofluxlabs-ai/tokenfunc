import type { Channel, ChannelHealthState } from '../types'

export type ChannelHealthValue = ChannelHealthState['api_health']

/** 外部渠道才有健康态；非外部渠道一律视为未标记 */
export function isExternalChannel(channel: Pick<Channel, 'is_external'>) {
  return channel.is_external === true
}

/** 任一维度 failed 即暂停派发（与后端 IsDispatchPaused 同口径，后端未返回派生字段时兜底） */
export function isDispatchPaused(
  channel: Pick<Channel, 'is_external' | 'health_state'>
) {
  if (!isExternalChannel(channel) || !channel.health_state) {
    return false
  }
  const state = channel.health_state
  return (
    state.dispatch_paused === true ||
    state.api_health === 'failed' ||
    state.inference_health === 'failed'
  )
}

/** 暂停派发的维度，给状态列 tooltip 用 */
export function pausedHealthDimensions(
  state: ChannelHealthState | null | undefined
): Array<'api' | 'inference'> {
  if (!state) {
    return []
  }
  const dimensions: Array<'api' | 'inference'> = []
  if (state.api_health === 'failed') {
    dimensions.push('api')
  }
  if (state.inference_health === 'failed') {
    dimensions.push('inference')
  }
  return dimensions
}
