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
/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { cloneElement, lazy, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocsLayout } from '../components/docs-layout'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={props.to.replace('$slug', props.params?.slug ?? '')}>
      {props.children}
    </a>
  ),
}))

vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children: React.ReactNode }) => (
    <div data-testid='public-layout'>{props.children}</div>
  ),
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  // 与真实组件一致：有 render 时把触发器渲染成传入的元素
  SheetTrigger: (props: {
    children: React.ReactNode
    render?: ReactElement
  }) =>
    props.render ? (
      cloneElement(props.render, undefined, props.children)
    ) : (
      <button type='button'>{props.children}</button>
    ),
  SheetContent: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  SheetHeader: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  SheetTitle: (props: { children: React.ReactNode }) => (
    <h2>{props.children}</h2>
  ),
}))

afterEach(cleanup)

describe('DocsLayout', () => {
  it('renders the page title and description from the registry', () => {
    render(
      <DocsLayout slug='api-models'>
        <p>content body</p>
      </DocsLayout>
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'List models'
    )
    expect(
      screen.getByText('Discover which models are available to your account.')
    ).toBeInTheDocument()
    expect(screen.getByText('content body')).toBeInTheDocument()
  })

  it('falls back to the default entry for unknown slugs', () => {
    render(
      <DocsLayout slug='garbage'>
        <p>content body</p>
      </DocsLayout>
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Quick start'
    )
  })

  it('exposes the mobile navigation trigger', () => {
    render(
      <DocsLayout slug='api-models'>
        <p>content body</p>
      </DocsLayout>
    )

    const trigger = screen.getByRole('button', { name: 'Docs pages' })
    // 吸顶条上直接显示当前页标题
    expect(trigger).toHaveTextContent('List models')
  })

  it('shows the skeleton fallback first, then the lazy page content', async () => {
    const LazyPage = lazy(async () => ({
      default: () => <p>lazy page arrived</p>,
    }))

    render(
      <DocsLayout slug='api-models'>
        <LazyPage />
      </DocsLayout>
    )

    expect(screen.queryByText('lazy page arrived')).toBeNull()
    expect(await screen.findByText('lazy page arrived')).toBeInTheDocument()
  })
})
