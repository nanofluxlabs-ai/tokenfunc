import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BarChart3,
  KeyRound,
  ReceiptText,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { TitledCard } from '@/components/ui/titled-card'

import type { EnterpriseOverview } from '../types'

type OverviewQuickLinksProps = {
  overview: EnterpriseOverview
  teamScoped: boolean
}

const ROW_CLASS =
  'hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none'

/** 入口行的内容：图标 + 标题 + 计数说明 + 箭头（外层是 Link） */
function QuickLinkContent(props: {
  icon: ReactNode
  tone: IconBadgeTone
  title: string
  description: string
}) {
  return (
    <>
      <IconBadge tone={props.tone} size='title'>
        {props.icon}
      </IconBadge>
      <div className='min-w-0 flex-1'>
        <div className='text-sm font-medium'>{props.title}</div>
        <div className='text-muted-foreground truncate text-xs'>
          {props.description}
        </div>
      </div>
      <ArrowRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </>
  )
}

/** 快捷入口：每行带该页的关键计数（原「活跃密钥」「团队 · 成员」卡的数字收在这里）；团队角色不显示财务对账 */
export function OverviewQuickLinks(props: OverviewQuickLinksProps) {
  const { t } = useTranslation()
  const { keys, org, scope, todos } = props.overview
  let keysHint = t('{{active}} / {{total}} active', {
    active: keys.active,
    total: keys.total,
  })
  if (keys.expiring_7d > 0) {
    keysHint = `${keysHint} · ${t('{{count}} expiring within 7 days', { count: keys.expiring_7d })}`
  }
  const membersHint = t('{{members}} members · {{login}} can sign in', {
    members: org.members,
    login: org.login_members,
  })
  const orgHint = props.teamScoped
    ? membersHint
    : `${t('{{count}} teams', { count: org.teams })} · ${membersHint}`
  const billsHint =
    todos.unpaid_bills > 0
      ? t('{{count}} bill(s) awaiting payment', { count: todos.unpaid_bills })
      : t('Bills, ledger and credit periods')

  return (
    <TitledCard
      title={t('Quick links')}
      description={t('Common pages, one click away')}
      className='h-full'
      contentClassName='flex flex-col gap-1 p-2 sm:p-3'
    >
      <Link to='/enterprise/keys' search={{}} className={ROW_CLASS}>
        <QuickLinkContent
          icon={<KeyRound />}
          tone='chart-1'
          title={t('API Keys')}
          description={keysHint}
        />
      </Link>
      <Link
        to='/enterprise/teams'
        search={scope ? { team_id: scope.team_id } : {}}
        className={ROW_CLASS}
      >
        <QuickLinkContent
          icon={<Users />}
          tone='chart-4'
          title={t('Teams & members')}
          description={orgHint}
        />
      </Link>
      <Link to='/enterprise/usage' search={{}} className={ROW_CLASS}>
        <QuickLinkContent
          icon={<BarChart3 />}
          tone='info'
          title={t('Usage Report')}
          description={t('By day, model and team')}
        />
      </Link>
      {!props.teamScoped && (
        <Link to='/enterprise/bills' search={{}} className={ROW_CLASS}>
          <QuickLinkContent
            icon={<ReceiptText />}
            tone='chart-5'
            title={t('Reconciliation')}
            description={billsHint}
          />
        </Link>
      )}
    </TitledCard>
  )
}
