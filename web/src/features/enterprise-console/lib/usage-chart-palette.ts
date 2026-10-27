import {
  CATEGORICAL_SLOT_COUNT,
  categoricalColor,
  categoricalOtherColor,
} from '@/components/charts/categorical-palette'

/** 构成图（环形）的切片数：前 N 项单独着色，其余合并为「其他」；N 等于分类色板的槽位数 */
export const USAGE_DONUT_TOP = CATEGORICAL_SLOT_COUNT

/**
 * 环形图切片颜色（按消耗倒序的前 USAGE_DONUT_TOP 项），明细表的色点用同一份，图表一一对应。
 * 取共享分类色板：品牌 --chart-2 / --chart-3 是中性色（黑 / 白 / 灰），当分类色会与「其他」混淆。
 */
export function usagePalette(dark: boolean): string[] {
  return Array.from({ length: USAGE_DONUT_TOP }, (_, index) =>
    categoricalColor(index, dark)
  )
}

/** 「其他」切片与排在 Top N 之后的明细行用中性灰 */
export function usageOthersColor(dark: boolean): string {
  return categoricalOtherColor(dark)
}
