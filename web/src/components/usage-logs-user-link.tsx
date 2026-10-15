import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

interface UsageLogsUserLinkProps {
  username: string
  className?: string
  children?: ReactNode
}

// 管理端列表里的用户名跳转：打开使用日志并按该用户名筛选（使用日志的 username 筛选只对管理员开放）
export function UsageLogsUserLink(props: UsageLogsUserLinkProps) {
  const { t } = useTranslation()
  return (
    <Link
      to='/usage-logs/$section'
      params={{ section: 'common' }}
      search={{ username: props.username, page: 1 }}
      className={cn(
        'hover:text-primary underline-offset-4 hover:underline',
        props.className
      )}
      aria-label={t('View usage logs of {{username}}', {
        username: props.username,
      })}
    >
      {props.children ?? props.username}
    </Link>
  )
}
