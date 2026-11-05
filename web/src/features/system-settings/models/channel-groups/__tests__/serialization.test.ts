import { describe, expect, it } from 'vitest'

import {
  buildChannelGroupRows,
  serializeChannelGroupRows,
  validateChannelGroupKey,
  type ChannelGroupFormValues,
} from '../lib/serialization'

const baseValues: ChannelGroupFormValues = {
  GroupRatio: '{"default":1,"gptpro":0.9,"legacy":2}',
  TopupGroupRatio: '{"gptpro":1.2}',
  UserUsableGroups: '{"default":"Default group","gptpro":"GPT pool"}',
  GroupGroupRatio:
    '{"ent_std":{"gptpro":0.8,"default":1},"vip":{"gptpro":0.7}}',
  AutoGroups: '["gptpro","default"]',
  GroupSpecialUsableGroup:
    '{"ent_std":{"+:gptpro":"Pool","-:default":"","legacy":"x"},"vip":{"+:legacy":""}}',
  ChannelGroupsRegistry:
    '{"gptpro":{"label":"GPT fast pool","order":0},"default":{"label":"","order":1}}',
}

describe('buildChannelGroupRows', () => {
  it('orders registered groups by order and puts unregistered groups last', () => {
    const rows = buildChannelGroupRows(baseValues)
    expect(rows.map((row) => row.key)).toEqual(['gptpro', 'default', 'legacy'])
  })

  it('falls back to the UserUsableGroups description and then the key for the name', () => {
    const rows = buildChannelGroupRows(baseValues)
    expect(rows.map((row) => row.label)).toEqual([
      'GPT fast pool',
      'Default group',
      'legacy',
    ])
  })

  it('reads ratio and top-up ratio from the upstream options', () => {
    const rows = buildChannelGroupRows(baseValues)
    expect(rows[0]).toMatchObject({
      ratio: '0.9',
      topupRatio: '1.2',
      isNew: false,
    })
    expect(rows[2]).toMatchObject({ ratio: '2', topupRatio: '' })
  })

  it('does not list a key that only exists in UserUsableGroups such as auto', () => {
    const rows = buildChannelGroupRows({
      ...baseValues,
      UserUsableGroups: '{"auto":"Auto","default":"Default group"}',
    })
    expect(rows.map((row) => row.key)).toEqual(['gptpro', 'default', 'legacy'])
  })

  it('does not resurrect a registry key that no longer exists in GroupRatio', () => {
    const rows = buildChannelGroupRows({
      ...baseValues,
      ChannelGroupsRegistry: '{"ghost":{"label":"Ghost","order":0}}',
    })
    expect(rows.map((row) => row.key)).not.toContain('ghost')
  })

  it('returns no rows when every option is empty', () => {
    const rows = buildChannelGroupRows({
      GroupRatio: '',
      TopupGroupRatio: '',
      UserUsableGroups: '',
      GroupGroupRatio: '',
      AutoGroups: '',
      GroupSpecialUsableGroup: '',
      ChannelGroupsRegistry: '',
    })
    expect(rows).toEqual([])
  })
})

describe('serializeChannelGroupRows', () => {
  it('completes the registry only when rows are unchanged', () => {
    const rows = buildChannelGroupRows(baseValues)
    const changes = serializeChannelGroupRows(rows, baseValues)
    expect(Object.keys(changes)).toEqual(['ChannelGroupsRegistry'])
    expect(JSON.parse(changes.ChannelGroupsRegistry ?? '')).toEqual({
      gptpro: { label: 'GPT fast pool', order: 0 },
      default: { label: 'Default group', order: 1 },
      legacy: { label: 'legacy', order: 2 },
    })
  })

  it('round-trips without changes once the registry matches the rows', () => {
    const rows = buildChannelGroupRows(baseValues)
    const synced = {
      ...baseValues,
      ...serializeChannelGroupRows(rows, baseValues),
    }
    expect(
      serializeChannelGroupRows(buildChannelGroupRows(synced), synced)
    ).toEqual({})
  })

  it('writes a renamed group only into the registry and leaves UserUsableGroups untouched', () => {
    const values = {
      ...baseValues,
      UserUsableGroups: '{"auto":"Auto","gptpro":"GPT pool"}',
    }
    const rows = buildChannelGroupRows(values).map((row) =>
      row.key === 'gptpro' ? { ...row, label: 'Renamed', ratio: '0.5' } : row
    )
    const changes = serializeChannelGroupRows(rows, values)
    expect(Object.keys(changes).sort()).toEqual([
      'ChannelGroupsRegistry',
      'GroupRatio',
    ])
    expect(JSON.parse(changes.ChannelGroupsRegistry ?? '').gptpro).toEqual({
      label: 'Renamed',
      order: 0,
    })
    expect(changes.UserUsableGroups).toBeUndefined()
  })

  it('keeps the existing key order of GroupRatio after a drag reorder and renumbers the registry', () => {
    const rows = buildChannelGroupRows(baseValues)
    const reordered = [rows[2], rows[0], rows[1]]
    const changes = serializeChannelGroupRows(reordered, baseValues)
    expect(changes.GroupRatio).toBeUndefined()
    expect(JSON.parse(changes.ChannelGroupsRegistry ?? '')).toEqual({
      legacy: { label: 'legacy', order: 0 },
      gptpro: { label: 'GPT fast pool', order: 1 },
      default: { label: 'Default group', order: 2 },
    })
  })

  it('appends a new group to every map and uses the key as the name fallback', () => {
    const rows = [
      ...buildChannelGroupRows(baseValues),
      {
        id: 'new_1',
        key: 'claude-pool',
        label: '  ',
        ratio: '1.5',
        topupRatio: '',
        isNew: true,
      },
    ]
    const changes = serializeChannelGroupRows(rows, baseValues)
    expect(Object.keys(JSON.parse(changes.GroupRatio ?? ''))).toEqual([
      'default',
      'gptpro',
      'legacy',
      'claude-pool',
    ])
    expect(JSON.parse(changes.GroupRatio ?? '')['claude-pool']).toBe(1.5)
    expect(
      JSON.parse(changes.ChannelGroupsRegistry ?? '')['claude-pool']
    ).toEqual({ label: 'claude-pool', order: 3 })
    expect(changes.UserUsableGroups).toBeUndefined()
    expect(changes.TopupGroupRatio).toBeUndefined()
  })

  it('skips rows whose key is empty, malformed or duplicated', () => {
    const rows = [
      ...buildChannelGroupRows(baseValues),
      {
        id: 'n1',
        key: '',
        label: '',
        ratio: '1',
        topupRatio: '',
        isNew: true,
      },
      {
        id: 'n2',
        key: 'Bad Key',
        label: '',
        ratio: '1',
        topupRatio: '',
        isNew: true,
      },
      {
        id: 'n3',
        key: 'gptpro',
        label: 'dup',
        ratio: '3',
        topupRatio: '',
        isNew: true,
      },
    ]
    const changes = serializeChannelGroupRows(rows, baseValues)
    expect(changes.GroupRatio).toBeUndefined()
    expect(changes.UserUsableGroups).toBeUndefined()
    expect(
      Object.keys(JSON.parse(changes.ChannelGroupsRegistry ?? ''))
    ).toEqual(['gptpro', 'default', 'legacy'])
  })

  it('cascades a deletion into UserUsableGroups, AutoGroups, GroupGroupRatio and GroupSpecialUsableGroup', () => {
    const rows = buildChannelGroupRows(baseValues).filter(
      (row) => row.key !== 'gptpro'
    )
    const changes = serializeChannelGroupRows(rows, baseValues)
    expect(JSON.parse(changes.GroupRatio ?? '')).toEqual({
      default: 1,
      legacy: 2,
    })
    expect(JSON.parse(changes.TopupGroupRatio ?? '')).toEqual({})
    expect(JSON.parse(changes.UserUsableGroups ?? '')).toEqual({
      default: 'Default group',
    })
    expect(JSON.parse(changes.AutoGroups ?? '')).toEqual(['default'])
    expect(JSON.parse(changes.GroupGroupRatio ?? '')).toEqual({
      ent_std: { default: 1 },
      vip: {},
    })
    expect(JSON.parse(changes.GroupSpecialUsableGroup ?? '')).toEqual({
      ent_std: { '-:default': '', legacy: 'x' },
      vip: { '+:legacy': '' },
    })
    expect(JSON.parse(changes.ChannelGroupsRegistry ?? '')).toEqual({
      default: { label: 'Default group', order: 0 },
      legacy: { label: 'legacy', order: 1 },
    })
  })

  it('removes bare special usable entries that name the deleted group', () => {
    const rows = buildChannelGroupRows(baseValues).filter(
      (row) => row.key !== 'legacy'
    )
    const changes = serializeChannelGroupRows(rows, baseValues)
    expect(JSON.parse(changes.GroupSpecialUsableGroup ?? '')).toEqual({
      ent_std: { '+:gptpro': 'Pool', '-:default': '' },
      vip: {},
    })
    expect(changes.AutoGroups).toBeUndefined()
    expect(changes.GroupGroupRatio).toBeUndefined()
  })
})

describe('validateChannelGroupKey', () => {
  it('rejects an empty key as required', () => {
    expect(validateChannelGroupKey('   ', [])).toBe('required')
  })

  it('rejects uppercase, spaces and a leading hyphen as pattern errors', () => {
    expect(validateChannelGroupKey('GptPro', [])).toBe('pattern')
    expect(validateChannelGroupKey('gpt pro', [])).toBe('pattern')
    expect(validateChannelGroupKey('-gpt', [])).toBe('pattern')
  })

  it('rejects a key already used by another row as duplicate', () => {
    expect(validateChannelGroupKey('gptpro', ['default', 'gptpro'])).toBe(
      'duplicate'
    )
  })

  it('accepts lowercase letters, digits, underscore and hyphen', () => {
    expect(validateChannelGroupKey('gpt_pro-2', ['default'])).toBeNull()
  })
})
