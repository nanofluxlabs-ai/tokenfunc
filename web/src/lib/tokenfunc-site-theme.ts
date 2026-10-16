/*
 * tokenfunc 二开：配色预设由管理员在系统设置中指定并通过 /api/status 下发，
 * 用户不能自行更换预设、字体或圆角；只保留密度与内容宽度这类布局偏好。
 * 上游 provider / 设置抽屉只在这里接线，便于与 new-api 同步。
 */
import { useState } from 'react'

import { useStatus } from '@/hooks/use-status'
import { readCachedStatus } from '@/lib/status-query'
import {
  DEFAULT_THEME_CUSTOMIZATION,
  THEME_PRESET_VALUES,
  type ThemeFont,
  type ThemePreset,
  type ThemeRadius,
} from '@/lib/theme-customization'

/** 全站主题是否锁定为管理员预设。用函数而非常量，避免 `!true` 被 lint 判为死代码。 */
export function isSiteThemeLocked(): boolean {
  return true
}

/**
 * 把服务端 /api/status 下发的 theme 字段收敛为已注册的预设；
 * 未知值回退到 default，这样后台误填或旧版本缺字段时页面仍可用。
 */
export function normalizeServerPreset(value: unknown): ThemePreset {
  if (
    typeof value === 'string' &&
    THEME_PRESET_VALUES.has(value as ThemePreset)
  ) {
    return value as ThemePreset
  }
  return DEFAULT_THEME_CUSTOMIZATION.preset
}

/**
 * 首帧预设来源优先级：服务端注入在 <body> 上的属性 → localStorage 里的 status 快照 → default。
 * 前两者都存在时说明已经和后端一致，React 挂载后不会再闪一次默认主题。
 */
function readInitialPreset(): ThemePreset {
  if (typeof document !== 'undefined') {
    const injected = document.body?.getAttribute('data-theme-preset')
    if (injected) return normalizeServerPreset(injected)
  }
  return normalizeServerPreset(readCachedStatus()?.theme)
}

/** 锁定时忽略用户本地保存的预设，始终跟随服务端；未锁定时原样返回上游的本地偏好。 */
export function useSiteThemePreset(localPreset: ThemePreset): ThemePreset {
  const { status } = useStatus()
  const [initialPreset] = useState<ThemePreset>(readInitialPreset)
  if (!isSiteThemeLocked()) return localPreset
  return status && 'theme' in status
    ? normalizeServerPreset(status.theme)
    : initialPreset
}

/** 锁定时字体完全由预设决定（PRESET_DEFAULT_FONT），忽略旧版本残留在 localStorage 的用户选择。 */
export function siteThemeFont(font: ThemeFont): ThemeFont {
  return isSiteThemeLocked() ? 'default' : font
}

/** 锁定时不写 data-theme-radius，圆角跟随预设的默认值。 */
export function siteThemeRadius(radius: ThemeRadius): ThemeRadius | null {
  if (isSiteThemeLocked()) return null
  return radius === DEFAULT_THEME_CUSTOMIZATION.radius ? null : radius
}
