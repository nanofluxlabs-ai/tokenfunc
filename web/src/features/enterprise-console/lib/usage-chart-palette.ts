/** 构成图（环形）的切片数：前 N 项单独着色，其余合并为「其他」 */
export const USAGE_DONUT_TOP = 6

/** 品牌预设图表色的取用顺序；预设挂在 body 的 data-theme-preset 上，必须从 body 读 */
const PALETTE_VARS = [
  '--chart-1',
  '--chart-4',
  '--chart-5',
  '--chart-2',
  '--chart-3',
]
const FALLBACK = ['#1db954', '#2363c4', '#a35f00', '#6a6a6a', '#878787']
/** 第 6 个切片与「其他」不在预设里，用固定色 */
const EXTRA_COLOR = '#a78bfa'
export const USAGE_OTHERS_COLOR = '#71717a'

/** 环形图切片颜色（按消耗倒序的前 USAGE_DONUT_TOP 项），明细表的色点用同一份，图表一一对应 */
export function readUsagePalette(): string[] {
  const style =
    typeof document === 'undefined' ? null : getComputedStyle(document.body)
  const colors = PALETTE_VARS.map(
    (name, index) => style?.getPropertyValue(name).trim() || FALLBACK[index]
  )
  return [...colors, EXTRA_COLOR].slice(0, USAGE_DONUT_TOP)
}
