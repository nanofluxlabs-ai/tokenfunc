// TokenFunc 二开：渠道分组页的纯函数。
// 把上游 6 个分组 option + 二开注册表 合成为可编辑的行，再把行写回各字段。
// key 集合以上游 GroupRatio ∪ TopupGroupRatio 为准，
// 注册表只提供名称与排序（注册表里残留、但已不在上游 option 中的 key 不再复活）。
// 可见性改为显式模型后，UserUsableGroups 不再由本页维护：读行时只作名称回退，
// 写回时原样保留（迁移后它只可能剩下上游用来暴露 auto 的项），唯一例外是删除分组时移除同名 key。

export type ChannelGroupFormValues = {
  GroupRatio: string
  TopupGroupRatio: string
  UserUsableGroups: string
  GroupGroupRatio: string
  AutoGroups: string
  GroupSpecialUsableGroup: string
  ChannelGroupsRegistry: string
}

export type ChannelGroupRow = {
  /** 行的稳定标识：已有分组用 key，新建行用临时 id（key 可编辑） */
  id: string
  key: string
  label: string
  /** 基准倍率，保留字符串以容纳输入中的中间态 */
  ratio: string
  /** 充值倍率，空串表示未配置 */
  topupRatio: string
  isNew: boolean
}

export type ChannelGroupKeyError = 'required' | 'pattern' | 'duplicate'

type RegistryEntry = { label?: unknown; order?: unknown }

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

let newRowCounter = 0

/** 新建行的临时 id，保证同一页面内唯一 */
export function createChannelGroupRowId(): string {
  newRowCounter += 1
  return `new_${newRowCounter}`
}

function parseObject<T>(value: string): Record<string, T> {
  if (!value || !value.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, T>
    }
  } catch {
    // 非法 JSON 由表单 zod 校验负责提示，这里按空对象处理
  }
  return {}
}

function parseStringArray(value: string): string[] {
  if (!value || !value.trim()) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    // 同上
  }
  return []
}

function normalizeRatio(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 1
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function canonical(value: unknown): string {
  return JSON.stringify(value)
}

/** 校验渠道分组 key；otherKeys 为同页其它行的 key */
export function validateChannelGroupKey(
  key: string,
  otherKeys: readonly string[]
): ChannelGroupKeyError | null {
  const trimmed = key.trim()
  if (!trimmed) return 'required'
  if (!KEY_PATTERN.test(trimmed)) return 'pattern'
  if (otherKeys.includes(trimmed)) return 'duplicate'
  return null
}

/** 上游两个倍率 option 的 key 并集，顺序为首次出现顺序 */
function collectExistingKeys(values: ChannelGroupFormValues): string[] {
  const ratioMap = parseObject<unknown>(values.GroupRatio)
  const topupMap = parseObject<unknown>(values.TopupGroupRatio)
  return [...new Set([...Object.keys(ratioMap), ...Object.keys(topupMap)])]
}

export function buildChannelGroupRows(
  values: ChannelGroupFormValues
): ChannelGroupRow[] {
  const ratioMap = parseObject<unknown>(values.GroupRatio)
  const usableMap = parseObject<unknown>(values.UserUsableGroups)
  const topupMap = parseObject<unknown>(values.TopupGroupRatio)
  const registry = parseObject<RegistryEntry>(values.ChannelGroupsRegistry)

  const rows = collectExistingKeys(values).map((key) => {
    const meta = registry[key]
    const registeredLabel =
      meta && typeof meta.label === 'string' ? meta.label.trim() : ''
    const usableDescription =
      typeof usableMap[key] === 'string' ? String(usableMap[key]).trim() : ''
    const order =
      meta && typeof meta.order === 'number' && Number.isFinite(meta.order)
        ? meta.order
        : Number.POSITIVE_INFINITY
    return {
      row: {
        id: key,
        key,
        label: registeredLabel || usableDescription || key,
        ratio: String(normalizeRatio(ratioMap[key])),
        topupRatio: Object.hasOwn(topupMap, key) ? String(topupMap[key]) : '',
        isNew: false,
      } satisfies ChannelGroupRow,
      order,
    }
  })

  // 已登记的按 order，再按 key；未登记的排最后
  rows.sort((a, b) => {
    if (a.order !== b.order) return a.order < b.order ? -1 : 1
    return a.row.key.localeCompare(b.row.key)
  })
  return rows.map((item) => item.row)
}

/** 行中 key 合法且不重复的部分（按显示顺序） */
export function collectValidRows(rows: ChannelGroupRow[]): ChannelGroupRow[] {
  const seen = new Set<string>()
  const valid: ChannelGroupRow[] = []
  for (const row of rows) {
    const key = row.key.trim()
    if (!KEY_PATTERN.test(key) || seen.has(key)) continue
    seen.add(key)
    valid.push({ ...row, key })
  }
  return valid
}

/**
 * 把行写回表单字段，只返回与当前值不同的字段。
 * - GroupRatio / TopupGroupRatio 保留原有 key 顺序，新 key 追加在后；
 * - 名称只写注册表，注册表按显示顺序重排 order 为 0..n-1；
 * - 被删除的分组级联清理 UserUsableGroups、AutoGroups、GroupGroupRatio 内层与 GroupSpecialUsableGroup 的 +:/-: 条目。
 */
export function serializeChannelGroupRows(
  rows: ChannelGroupRow[],
  values: ChannelGroupFormValues
): Partial<ChannelGroupFormValues> {
  const validRows = collectValidRows(rows)
  const existingKeys = collectExistingKeys(values)
  const rowKeys = new Set(validRows.map((row) => row.key))

  const orderedRows = [
    ...existingKeys
      .map((key) => validRows.find((row) => row.key === key))
      .filter((row): row is ChannelGroupRow => row !== undefined),
    ...validRows.filter((row) => !existingKeys.includes(row.key)),
  ]

  const groupRatio: Record<string, number> = {}
  const topupGroupRatio: Record<string, number> = {}
  for (const row of orderedRows) {
    groupRatio[row.key] = normalizeRatio(row.ratio)
    const topup = row.topupRatio.trim()
    if (topup !== '' && Number.isFinite(Number(topup))) {
      topupGroupRatio[row.key] = Number(topup)
    }
  }

  const registry: Record<string, { label: string; order: number }> = {}
  validRows.forEach((row, index) => {
    registry[row.key] = { label: row.label.trim() || row.key, order: index }
  })

  const changes: Partial<ChannelGroupFormValues> = {}
  const assignIfChanged = (
    field: keyof ChannelGroupFormValues,
    next: unknown
  ) => {
    const current =
      field === 'AutoGroups'
        ? parseStringArray(values[field])
        : parseObject<unknown>(values[field])
    if (canonical(current) !== canonical(next)) {
      changes[field] = stringify(next)
    }
  }

  assignIfChanged('GroupRatio', groupRatio)
  assignIfChanged('TopupGroupRatio', topupGroupRatio)
  assignIfChanged('ChannelGroupsRegistry', registry)

  const removedKeys = existingKeys.filter((key) => !rowKeys.has(key))
  if (removedKeys.length === 0) return changes

  const removed = new Set(removedKeys)
  assignIfChanged(
    'UserUsableGroups',
    Object.fromEntries(
      Object.entries(parseObject<unknown>(values.UserUsableGroups)).filter(
        ([key]) => !removed.has(key)
      )
    )
  )
  assignIfChanged(
    'AutoGroups',
    parseStringArray(values.AutoGroups).filter((key) => !removed.has(key))
  )

  const groupGroupRatio = parseObject<Record<string, unknown>>(
    values.GroupGroupRatio
  )
  const nextGroupGroupRatio: Record<string, Record<string, unknown>> = {}
  for (const [userGroup, inner] of Object.entries(groupGroupRatio)) {
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
      nextGroupGroupRatio[userGroup] = inner
      continue
    }
    nextGroupGroupRatio[userGroup] = Object.fromEntries(
      Object.entries(inner).filter(
        ([channelGroup]) => !removed.has(channelGroup)
      )
    )
  }
  assignIfChanged('GroupGroupRatio', nextGroupGroupRatio)

  const special = parseObject<Record<string, unknown>>(
    values.GroupSpecialUsableGroup
  )
  const nextSpecial: Record<string, Record<string, unknown>> = {}
  for (const [userGroup, inner] of Object.entries(special)) {
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
      nextSpecial[userGroup] = inner
      continue
    }
    nextSpecial[userGroup] = Object.fromEntries(
      Object.entries(inner).filter(([rawKey]) => {
        const name =
          rawKey.startsWith('+:') || rawKey.startsWith('-:')
            ? rawKey.slice(2)
            : rawKey
        return !removed.has(name)
      })
    )
  }
  assignIfChanged('GroupSpecialUsableGroup', nextSpecial)

  return changes
}
