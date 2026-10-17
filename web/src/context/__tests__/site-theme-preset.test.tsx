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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ThemeCustomizationProvider,
  useThemeCustomization,
} from '@/context/theme-customization-provider'
import { ThemeProvider } from '@/context/theme-provider'

const getStatusMock = vi.fn()

vi.mock('@/lib/api', () => ({
  getStatus: () => getStatusMock(),
}))

// tokenfunc 二开：配色预设/字体/圆角跟随 /api/status 下发的 theme，不再读用户本地偏好。
function ThemeControls() {
  const customization = useThemeCustomization()
  return (
    <output aria-label='Preset'>{customization.customization.preset}</output>
  )
}

function ThemeFixture() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemeCustomizationProvider>
          <ThemeControls />
        </ThemeCustomizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  getStatusMock.mockReset()
  getStatusMock.mockResolvedValue({ theme: 'tokenfunc' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.trim().split('=')[0]
    document.cookie = `${name}=; path=/; max-age=0`
  }
  document.documentElement.classList.remove('light', 'dark')
  for (const name of document.body.getAttributeNames()) {
    if (name.startsWith('data-theme-')) document.body.removeAttribute(name)
  }
})

describe('server-driven color preset', () => {
  it('applies the preset from /api/status and resolves the brand font', async () => {
    render(<ThemeFixture />)

    await waitFor(() =>
      expect(document.body).toHaveAttribute('data-theme-preset', 'tokenfunc')
    )
    expect(screen.getByLabelText('Preset')).toHaveTextContent('tokenfunc')
    expect(document.body).toHaveAttribute('data-theme-font', 'brand')
    expect(document.body).not.toHaveAttribute('data-theme-radius')
  })

  it('ignores a preset left in localStorage by older builds', async () => {
    localStorage.setItem('tokenfunc:theme:v1:preset', 'rose-garden')
    localStorage.setItem('tokenfunc:theme:v1:font', 'serif')

    render(<ThemeFixture />)

    await waitFor(() =>
      expect(document.body).toHaveAttribute('data-theme-preset', 'tokenfunc')
    )
    expect(document.body).toHaveAttribute('data-theme-font', 'brand')
  })

  it('uses the server-injected body attribute before status has loaded', () => {
    document.body.setAttribute('data-theme-preset', 'tokenfunc')
    getStatusMock.mockReturnValue(new Promise(() => {}))

    render(<ThemeFixture />)

    expect(screen.getByLabelText('Preset')).toHaveTextContent('tokenfunc')
    expect(document.body).toHaveAttribute('data-theme-preset', 'tokenfunc')
    expect(document.body).toHaveAttribute('data-theme-font', 'brand')
  })

  it('falls back to the default preset when the server sends an unknown theme', async () => {
    getStatusMock.mockResolvedValue({ theme: 'no-such-preset' })

    render(<ThemeFixture />)

    await waitFor(() =>
      expect(screen.getByLabelText('Preset')).toHaveTextContent('default')
    )
    expect(document.body).not.toHaveAttribute('data-theme-preset')
    expect(document.body).toHaveAttribute('data-theme-font', 'sans')
  })

  it('switches presets when the admin changes the server theme', async () => {
    getStatusMock.mockResolvedValue({ theme: 'anthropic' })

    render(<ThemeFixture />)

    await waitFor(() =>
      expect(document.body).toHaveAttribute('data-theme-preset', 'anthropic')
    )
    expect(document.body).toHaveAttribute('data-theme-font', 'serif')
  })
})
