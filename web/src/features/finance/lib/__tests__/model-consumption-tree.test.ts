import { describe, expect, it } from 'vitest'

import type { FinanceModelConsumptionRow } from '../../types'
import { buildModelConsumptionTree, calcShare } from '../model-consumption-tree'

const LABELS = { ungrouped: 'Ungrouped', unknownChannel: 'Unknown' }

function row(
  overrides: Partial<FinanceModelConsumptionRow>
): FinanceModelConsumptionRow {
  return {
    model_name: 'gpt-4o',
    group: 'default',
    group_label: '默认分组',
    channel_id: 1,
    channel_name: 'main',
    consume_quota: 0,
    refund_quota: 0,
    net_quota: 0,
    consume_count: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    ...overrides,
  }
}

describe('model consumption tree', () => {
  it('returns an empty tree with zero stats for no rows', () => {
    expect(buildModelConsumptionTree([], LABELS)).toEqual({
      nodes: [],
      stats: {
        netQuota: 0,
        groupCount: 0,
        modelCombinationCount: 0,
        consumeCount: 0,
      },
    })
  })

  it('inlines the channel for a single-channel model and nests channels otherwise', () => {
    const { nodes } = buildModelConsumptionTree(
      [
        row({
          model_name: 'solo',
          channel_id: 7,
          channel_name: 'only',
          net_quota: 100,
        }),
        row({
          model_name: 'multi',
          channel_id: 1,
          channel_name: 'a',
          net_quota: 300,
        }),
        row({
          model_name: 'multi',
          channel_id: 2,
          channel_name: '',
          net_quota: 100,
        }),
      ],
      LABELS
    )
    expect(nodes).toHaveLength(1)
    const models = nodes[0].children ?? []
    const solo = models.find((model) => model.name === 'solo')
    const multi = models.find((model) => model.name === 'multi')
    expect(solo?.inlineChannel).toBe('only')
    expect(solo?.children).toBeUndefined()
    expect(multi?.childCount).toBe(2)
    expect(multi?.children?.map((channel) => channel.label)).toEqual([
      'a',
      '#2',
    ])
  })

  it('uses the overall total for group and model shares and the model total for channel shares', () => {
    const { nodes, stats } = buildModelConsumptionTree(
      [
        row({
          group: 'vip',
          group_label: 'VIP',
          model_name: 'm1',
          channel_id: 1,
          net_quota: 600,
          consume_count: 6,
        }),
        row({
          group: 'vip',
          group_label: 'VIP',
          model_name: 'm1',
          channel_id: 2,
          net_quota: 200,
          consume_count: 2,
        }),
        row({
          group: '',
          group_label: '',
          model_name: 'm2',
          channel_id: 0,
          channel_name: '',
          net_quota: 200,
          consume_count: 1,
        }),
      ],
      LABELS
    )
    expect(stats).toEqual({
      netQuota: 1000,
      groupCount: 2,
      modelCombinationCount: 2,
      consumeCount: 9,
    })
    expect(nodes.map((node) => node.label)).toEqual(['VIP', 'Ungrouped'])
    expect(nodes[0].share).toBe(80)
    expect(nodes[0].children?.[0].share).toBe(80)
    expect(
      nodes[0].children?.[0].children?.map((channel) => channel.share)
    ).toEqual([75, 25])
    expect(nodes[1].children?.[0].inlineChannel).toBe('Unknown')
  })

  it('clamps shares and treats a non-positive total as zero', () => {
    expect(calcShare(5, 0)).toBe(0)
    expect(calcShare(-5, 10)).toBe(0)
    expect(calcShare(20, 10)).toBe(100)
  })
})
