/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useStatus } from '@/hooks/use-status'
import { readCachedStatus } from '@/lib/status-query'
import {
  CONTENT_LAYOUT_VALUES,
  type ContentLayout,
  DEFAULT_THEME_CUSTOMIZATION,
  normalizeServerPreset,
  resolveThemeFont,
  THEME_SCALE_VALUES,
  type ThemeCustomization,
  type ThemePreset,
  type ThemeScale,
} from '@/lib/theme-customization'
import {
  readThemePreference,
  THEME_STORAGE_KEYS,
  writeThemePreference,
} from '@/lib/theme-storage'

function applyAttribute(name: string, value: string | null) {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  if (value === null) {
    body.removeAttribute(name)
  } else {
    body.setAttribute(name, value)
  }
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

type ThemeCustomizationContextType = {
  defaults: ThemeCustomization
  customization: ThemeCustomization
  setScale: (scale: ThemeScale) => void
  setContentLayout: (contentLayout: ContentLayout) => void
  resetCustomization: () => void
}

// Fallback used when a consumer renders outside the provider (e.g. an error
// route mounted before providers are ready, or stale HMR boundaries). Keeping
// it permissive prevents the whole tree from crashing — the UI just behaves
// like the defaults until the real provider re-mounts.
const FALLBACK_CONTEXT: ThemeCustomizationContextType = {
  defaults: DEFAULT_THEME_CUSTOMIZATION,
  customization: DEFAULT_THEME_CUSTOMIZATION,
  setScale: () => {},
  setContentLayout: () => {},
  resetCustomization: () => {},
}

const ThemeCustomizationContext =
  createContext<ThemeCustomizationContextType>(FALLBACK_CONTEXT)

/**
 * tokenfunc 二开：配色预设由管理员在系统设置中指定并通过 /api/status 下发，
 * 用户不能自行更换预设、字体或圆角；只保留密度与内容宽度这类布局偏好。
 */
export function ThemeCustomizationProvider(props: {
  children: React.ReactNode
}) {
  const { status } = useStatus()
  const [initialPreset] = useState<ThemePreset>(readInitialPreset)
  const preset =
    status && 'theme' in status
      ? normalizeServerPreset(status.theme)
      : initialPreset

  const [scale, _setScale] = useState<ThemeScale>(() =>
    readThemePreference<ThemeScale>(
      THEME_STORAGE_KEYS.scale,
      THEME_SCALE_VALUES,
      DEFAULT_THEME_CUSTOMIZATION.scale
    )
  )
  const [contentLayout, _setContentLayout] = useState<ContentLayout>(() =>
    readThemePreference<ContentLayout>(
      THEME_STORAGE_KEYS.contentLayout,
      CONTENT_LAYOUT_VALUES,
      DEFAULT_THEME_CUSTOMIZATION.contentLayout
    )
  )

  // Mirror state to the <body> via data-* attributes so theme-presets.css can
  // override CSS variables at the right cascade layer.
  useEffect(() => {
    applyAttribute(
      'data-theme-preset',
      preset === DEFAULT_THEME_CUSTOMIZATION.preset ? null : preset
    )
  }, [preset])

  // 字体完全由预设决定（见 PRESET_DEFAULT_FONT），DOM 上始终写入解析后的具体值。
  useEffect(() => {
    applyAttribute('data-theme-font', resolveThemeFont('default', preset))
  }, [preset])

  useEffect(() => {
    applyAttribute(
      'data-theme-scale',
      scale === DEFAULT_THEME_CUSTOMIZATION.scale ? null : scale
    )
  }, [scale])

  useEffect(() => {
    applyAttribute('data-theme-content-layout', contentLayout)
  }, [contentLayout])

  const setScale = useCallback((value: ThemeScale) => {
    _setScale(value)
    writeThemePreference(
      THEME_STORAGE_KEYS.scale,
      value === DEFAULT_THEME_CUSTOMIZATION.scale ? null : value
    )
  }, [])

  const setContentLayout = useCallback((value: ContentLayout) => {
    _setContentLayout(value)
    writeThemePreference(
      THEME_STORAGE_KEYS.contentLayout,
      value === DEFAULT_THEME_CUSTOMIZATION.contentLayout ? null : value
    )
  }, [])

  const resetCustomization = useCallback(() => {
    setScale(DEFAULT_THEME_CUSTOMIZATION.scale)
    setContentLayout(DEFAULT_THEME_CUSTOMIZATION.contentLayout)
  }, [setScale, setContentLayout])

  const value = useMemo<ThemeCustomizationContextType>(
    () => ({
      defaults: DEFAULT_THEME_CUSTOMIZATION,
      customization: { preset, scale, contentLayout },
      setScale,
      setContentLayout,
      resetCustomization,
    }),
    [
      preset,
      scale,
      contentLayout,
      setScale,
      setContentLayout,
      resetCustomization,
    ]
  )

  return (
    <ThemeCustomizationContext.Provider value={value}>
      {props.children}
    </ThemeCustomizationContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useThemeCustomization() {
  return useContext(ThemeCustomizationContext)
}
