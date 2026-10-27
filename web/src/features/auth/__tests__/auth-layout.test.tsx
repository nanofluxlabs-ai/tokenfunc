import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthLayout } from '../auth-layout'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    children: React.ReactNode
    className?: string
    style?: React.CSSProperties
  }) => (
    <a href={props.to} className={props.className} style={props.style}>
      {props.children}
    </a>
  ),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'tokenfunc',
    logo: '/logo.png',
    loading: false,
  }),
}))

afterEach(() => {
  cleanup()
})

describe('AuthLayout brand aside', () => {
  it('renders the sign-in variant with the service stats and the form slot', () => {
    render(
      <AuthLayout variant='sign-in'>
        <form aria-label='login form' />
      </AuthLayout>
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'One endpoint'
    )
    // 桌面品牌区与手机信任条各一份
    expect(screen.getAllByText('Service SLA')).toHaveLength(2)
    expect(screen.getAllByText('99.95%')).toHaveLength(2)
    expect(
      screen.queryByText('500+ account pool, stable supply')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'login form' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /tokenfunc/ })).toHaveAttribute(
      'href',
      '/'
    )
  })

  it('renders the sign-up variant with the three selling points instead of stats', () => {
    render(
      <AuthLayout variant='sign-up'>
        <div />
      </AuthLayout>
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Enterprise-grade'
    )
    expect(screen.getAllByRole('list')).toHaveLength(2)
    expect(
      screen.getAllByText('500+ account pool, stable supply')
    ).toHaveLength(2)
    expect(screen.queryByText('Service SLA')).not.toBeInTheDocument()
  })

  it('keeps only the brand link below lg so the form starts on the first mobile screen', () => {
    render(
      <AuthLayout variant='sign-in'>
        <form aria-label='login form' />
      </AuthLayout>
    )

    // 营销区与版权只在 lg 以上出现；Logo 链接任何宽度都在
    const marketing = screen.getByRole('heading', { level: 1 }).parentElement
    expect(marketing).toHaveClass('hidden', 'lg:flex')
    expect(screen.getByText(/© \d{4} tokenfunc/)).toHaveClass(
      'hidden',
      'lg:inline'
    )
    expect(screen.getByRole('link', { name: /tokenfunc/ })).not.toHaveClass(
      'hidden'
    )
    // 手机表单卡垂直居中，桌面去掉卡片外观
    expect(screen.getByRole('main')).toHaveClass('justify-center')
    expect(
      screen.getByRole('form', { name: 'login form' }).parentElement
    ).toHaveClass('backdrop-blur-xl', 'lg:bg-transparent', 'lg:border-0')
  })

  it('shows the trust strip under the form only below lg', () => {
    render(
      <AuthLayout variant='sign-in'>
        <form aria-label='login form' />
      </AuthLayout>
    )

    const stripStat = screen
      .getAllByText('Service SLA')
      .find((node) => node.closest('main'))
    expect(stripStat?.closest('dl')).toHaveClass('lg:hidden')
  })

  it('defaults to the sign-in copy when no variant is given', () => {
    render(
      <AuthLayout>
        <div />
      </AuthLayout>
    )
    expect(screen.getAllByText('Cache hit rate')).toHaveLength(2)
  })
})
