// TokenFunc 二开：用户分组定价表的行视图与倍率解析，定价表组件与保存 hook 共用。
// 口径是「基准价 + 覆盖」：每行只记录可见与倍率覆盖，倍率留空 = 继承渠道分组的基准倍率；
// 数组顺序也是数据：可见行在前、按用户分组自己的顺序，不可见行在后。
import type { UserGroupPricingRow } from '@/lib/tokenfunc-groups'

/** 一行的编辑态：服务端数据 + 倍率输入原文（提交时再转数字） */
export type PricingRowView = UserGroupPricingRow & {
  ratioText: string
}

/** 把倍率输入原文解析成数字；留空或不是 ≥0 的数字都返回 null */
export function parseRatioText(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function toPricingRowViews(
  rows: UserGroupPricingRow[]
): PricingRowView[] {
  return rows.map((row) => ({
    ...row,
    ratioText: row.ratio === null ? '' : String(row.ratio),
  }))
}

/** 倍率输入非空但不是 ≥0 的数字（隐藏行的倍率不参与校验） */
export function isRatioInvalid(row: PricingRowView): boolean {
  return (
    row.visible &&
    row.ratioText.trim() !== '' &&
    parseRatioText(row.ratioText) === null
  )
}
