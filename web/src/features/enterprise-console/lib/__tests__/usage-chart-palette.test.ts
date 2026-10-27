import { describe, expect, test } from 'vitest'

import {
  USAGE_DONUT_TOP,
  usageOthersColor,
  usagePalette,
} from '../usage-chart-palette'

/** 灰阶色：RGB 三个分量相差很小，读起来像「其他 / 无数据」 */
function isGrayish(hex: string): boolean {
  const channels = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16)
  )
  return Math.max(...channels) - Math.min(...channels) < 24
}

describe('usagePalette', () => {
  test.each([false, true])(
    'gives every named slice a distinct non-gray color (dark=%s)',
    (dark) => {
      const palette = usagePalette(dark)

      expect(palette).toHaveLength(USAGE_DONUT_TOP)
      expect(new Set(palette).size).toBe(USAGE_DONUT_TOP)
      expect(palette.filter(isGrayish)).toEqual([])
    }
  )

  test.each([false, true])(
    'keeps the others color gray and outside the named slices (dark=%s)',
    (dark) => {
      const others = usageOthersColor(dark)

      expect(isGrayish(others)).toBe(true)
      expect(usagePalette(dark)).not.toContain(others)
    }
  )
})
