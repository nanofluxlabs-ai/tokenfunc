import { Link } from '@tanstack/react-router'
import { AlertTriangle, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert'

import {
  buildOverviewTodos,
  isSevereTodo,
  type OverviewTodo,
  overviewTodoKey,
} from '../lib/overview'
import type { OverviewTodos as OverviewTodosData } from '../types'

const LINK_CLASS = 'text-xs underline-offset-4 hover:underline'

type OverviewTodosProps = {
  todos: OverviewTodosData
}

/** 概览待办列表：逾期账单 / 团队预算 / 授信预警 / 耗尽与即将过期的 key，每条带入口深链；没有待办不渲染 */
export function OverviewTodos(props: OverviewTodosProps) {
  const { t } = useTranslation()
  const items = buildOverviewTodos(props.todos)
  if (items.length === 0) return null

  const describe = (todo: OverviewTodo): { title: string; link: ReactNode } => {
    switch (todo.kind) {
      case 'overdue_bills':
        return {
          title: t('{{count}} bill(s) overdue', { count: todo.count }),
          link: (
            <Link to='/enterprise/bills' className={LINK_CLASS}>
              {t('View bills')}
            </Link>
          ),
        }
      case 'unpaid_bills':
        return {
          title: t('{{count}} bill(s) awaiting payment', { count: todo.count }),
          link: (
            <Link to='/enterprise/bills' className={LINK_CLASS}>
              {t('View bills')}
            </Link>
          ),
        }
      case 'credit_alert':
        return {
          title: t('Credit usage reached the alert threshold'),
          link: null,
        }
      case 'team_budget_exceeded':
        return {
          title: todo.team.budget_enforce
            ? t('{{team}} is over budget and blocked', {
                team: todo.team.team_name,
              })
            : t('{{team}} is over budget', { team: todo.team.team_name }),
          link: (
            <Link
              to='/enterprise/teams'
              search={{ team_id: todo.team.team_id }}
              className={LINK_CLASS}
            >
              {t('View team')}
            </Link>
          ),
        }
      case 'team_budget_warn':
        return {
          title: t('{{team}} budget at {{percent}}%', {
            team: todo.team.team_name,
            percent: todo.team.budget_percent,
          }),
          link: (
            <Link
              to='/enterprise/teams'
              search={{ team_id: todo.team.team_id }}
              className={LINK_CLASS}
            >
              {t('View team')}
            </Link>
          ),
        }
      case 'exhausted_keys':
        return {
          title: t('{{count}} key(s) exhausted', { count: todo.count }),
          link: (
            <Link
              to='/enterprise/keys'
              search={{ status: 4 }}
              className={LINK_CLASS}
            >
              {t('View keys')}
            </Link>
          ),
        }
      case 'expiring_keys':
        return {
          title: t('{{count}} key(s) expire within 7 days', {
            count: todo.count,
          }),
          link: (
            <Link
              to='/enterprise/keys'
              search={{ expiring: true }}
              className={LINK_CLASS}
            >
              {t('View keys')}
            </Link>
          ),
        }
    }
  }

  return (
    <section
      aria-label={t('To-dos')}
      className='grid gap-2 md:grid-cols-2 xl:grid-cols-3'
    >
      {items.map((todo) => {
        const { title, link } = describe(todo)
        const severe = isSevereTodo(todo)
        const Icon = todo.kind === 'expiring_keys' ? Clock : AlertTriangle
        return (
          <Alert
            key={overviewTodoKey(todo)}
            variant={severe ? 'destructive' : 'default'}
            className={severe ? undefined : 'text-warning'}
          >
            <Icon aria-hidden='true' />
            <AlertTitle className='text-foreground'>{title}</AlertTitle>
            {link !== null && <AlertAction>{link}</AlertAction>}
          </Alert>
        )
      })}
    </section>
  )
}
