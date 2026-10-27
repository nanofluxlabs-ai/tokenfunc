/**
 * 分类色板：按实体身份（模型、密钥）固定顺序取色，不循环。
 * 首位是品牌绿，其余取自已校验的分类色；亮 / 暗两套分别对各自底色校验过
 * 明度带、色觉障碍区分度与相邻色差（dataviz validate_palette）。超出槽位的实体并入「其他」。
 */
const LIGHT_SLOTS = ['#1db954', '#2a78d6', '#eb6834', '#4a3aa7', '#e87ba4']
const DARK_SLOTS = ['#1aa34a', '#3987e5', '#d95926', '#9085e9', '#d55181']

/** 「其他」用中性灰，不占分类槽位 */
const OTHER_LIGHT = '#878787'
const OTHER_DARK = '#8a8a8a'

export const CATEGORICAL_SLOT_COUNT = LIGHT_SLOTS.length

export function categoricalColor(index: number, dark: boolean): string {
  const slots = dark ? DARK_SLOTS : LIGHT_SLOTS
  return slots[Math.min(index, slots.length - 1)]
}

export function categoricalOtherColor(dark: boolean): string {
  return dark ? OTHER_DARK : OTHER_LIGHT
}

/** 实体系列色：「其他」恒为中性灰，其余按排位取固定槽位 */
export function categoricalSeriesColor(
  index: number,
  isOther: boolean,
  dark: boolean
): string {
  return isOther ? categoricalOtherColor(dark) : categoricalColor(index, dark)
}
