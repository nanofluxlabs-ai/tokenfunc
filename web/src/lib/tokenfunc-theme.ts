/*
 * tokenfunc 品牌预设数据。只存纯数据，禁止 import theme-customization.ts：
 * ThemePreset 类型由 THEME_PRESETS 推导，本文件只能被它依赖，否则循环引用。
 */

/** 品牌预设：#121212 画布 + Spotify 式品牌绿 #1ED760，色值见 styles/brand-presets.css */
export const TOKENFUNC_THEME_PRESETS = [
  {
    value: 'tokenfunc',
    name: 'tokenfunc',
    swatches: ['oklch(0.17 0 0)', 'oklch(0.79 0.2 149)'],
  },
] as const

/** 品牌字体轴（Figtree + Noto Sans SC），仅由品牌预设选用，见 brand-presets.css 的 [data-theme-font='brand'] */
export type TokenfuncThemeFont = 'brand'

export const TOKENFUNC_PRESET_FONTS = {
  tokenfunc: 'brand',
} as const
