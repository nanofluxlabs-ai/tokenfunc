import type { FinanceModelConsumptionRow } from '../types'

export type ModelTreeLevel = 'group' | 'model' | 'channel'

export interface ModelTreeNode {
  id: string
  level: ModelTreeLevel
  /** 分组 key / 模型名 / 渠道名 */
  name: string
  /** 分组显示名（分组行）；渠道行同 name */
  label: string
  netQuota: number
  consumeCount: number
  totalTokens: number
  /** 占比 0~100：分组与模型行分母为全局总消费，渠道行分母为所属模型 */
  share: number
  /** 分组行：模型数；模型行：渠道数 */
  childCount: number
  /** 模型只走了一个渠道时内联渠道名，不再生成子行 */
  inlineChannel?: string
  children?: ModelTreeNode[]
}

export interface ModelTreeStats {
  netQuota: number
  groupCount: number
  modelCombinationCount: number
  consumeCount: number
}

export function calcShare(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (part / total) * 100))
}

/** 行 id 用 NUL 分隔三段 key，分组名 / 模型名里不会出现 */
const SEP = '\u0000'

function channelLabel(
  row: FinanceModelConsumptionRow,
  unknown: string
): string {
  if (row.channel_name) return row.channel_name
  return row.channel_id > 0 ? `#${row.channel_id}` : unknown
}

/**
 * 扁平行 → 分组 → 模型 → 渠道 三层树；各层按净消费降序。
 * labels.ungrouped 为空分组名的显示；labels.unknownChannel 为 channel_id<=0 的显示。
 */
export function buildModelConsumptionTree(
  rows: FinanceModelConsumptionRow[],
  labels: { ungrouped: string; unknownChannel: string }
): { nodes: ModelTreeNode[]; stats: ModelTreeStats } {
  const total = rows.reduce((sum, row) => sum + row.net_quota, 0)
  const groups = new Map<
    string,
    { label: string; models: Map<string, FinanceModelConsumptionRow[]> }
  >()
  for (const row of rows) {
    const group = groups.get(row.group) ?? {
      label: row.group ? row.group_label || row.group : labels.ungrouped,
      models: new Map<string, FinanceModelConsumptionRow[]>(),
    }
    groups.set(row.group, group)
    const channels = group.models.get(row.model_name) ?? []
    channels.push(row)
    group.models.set(row.model_name, channels)
  }

  const byNetQuotaDesc = (a: { netQuota: number }, b: { netQuota: number }) =>
    b.netQuota - a.netQuota

  const nodes: ModelTreeNode[] = []
  let modelCombinationCount = 0
  for (const [groupKey, group] of groups) {
    const models: ModelTreeNode[] = []
    for (const [modelName, channels] of group.models) {
      modelCombinationCount += 1
      const modelNet = channels.reduce((sum, row) => sum + row.net_quota, 0)
      const modelNode: ModelTreeNode = {
        id: [groupKey, modelName].join(SEP),
        level: 'model',
        name: modelName,
        label: modelName,
        netQuota: modelNet,
        consumeCount: channels.reduce((sum, row) => sum + row.consume_count, 0),
        totalTokens: channels.reduce((sum, row) => sum + row.total_tokens, 0),
        share: calcShare(modelNet, total),
        childCount: channels.length,
      }
      if (channels.length === 1) {
        modelNode.inlineChannel = channelLabel(
          channels[0],
          labels.unknownChannel
        )
      } else {
        modelNode.children = channels
          .map((row) => ({
            id: [groupKey, modelName, String(row.channel_id)].join(SEP),
            level: 'channel' as const,
            name: channelLabel(row, labels.unknownChannel),
            label: channelLabel(row, labels.unknownChannel),
            netQuota: row.net_quota,
            consumeCount: row.consume_count,
            totalTokens: row.total_tokens,
            share: calcShare(row.net_quota, modelNet),
            childCount: 0,
          }))
          .sort(byNetQuotaDesc)
      }
      models.push(modelNode)
    }
    models.sort(byNetQuotaDesc)
    const groupNet = models.reduce((sum, model) => sum + model.netQuota, 0)
    nodes.push({
      id: groupKey,
      level: 'group',
      name: groupKey,
      label: group.label,
      netQuota: groupNet,
      consumeCount: models.reduce((sum, model) => sum + model.consumeCount, 0),
      totalTokens: models.reduce((sum, model) => sum + model.totalTokens, 0),
      share: calcShare(groupNet, total),
      childCount: models.length,
      children: models,
    })
  }
  nodes.sort(byNetQuotaDesc)
  return {
    nodes,
    stats: {
      netQuota: total,
      groupCount: nodes.length,
      modelCombinationCount,
      consumeCount: rows.reduce((sum, row) => sum + row.consume_count, 0),
    },
  }
}
