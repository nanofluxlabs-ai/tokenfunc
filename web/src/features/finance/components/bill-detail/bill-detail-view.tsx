import { ArrowLeft } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  BillExportCsvButton,
  BillStatusBadge,
  InvoiceButton,
} from '@/features/enterprise-console/components/bills-table'
import { CREDIT_PERIOD_STATUSES } from '@/features/enterprise-console/constants'

import type { FinanceBillContext } from '../../types'
import { BillDetailContent, type BillDetailScope } from './bill-detail-content'

type BillDetailViewProps = {
  scope: BillDetailScope
  context: FinanceBillContext | null | undefined
  isLoading: boolean
  notFound: boolean
  /** 返回列表的 Link 元素，作为返回按钮的渲染根 */
  backLink: ReactElement
  /** 管理员专属操作（账期包归档、进行中账期导出），企业侧不传 */
  adminActions?: (context: FinanceBillContext) => ReactNode
  /** 点击「标记已核对」；企业侧不传，不显示核对入口 */
  onAckReconcile?: () => void
}

/** 账单详情页骨架：标题（账单号 / 账期序号 + 企业名 + 状态）+ 操作区 + 正文；管理员财务中心与企业控制台共用 */
export function BillDetailView(props: BillDetailViewProps) {
  const { t } = useTranslation()
  const context = props.context
  const summary = context?.summary
  const title = summary
    ? summary.bill_no || t('Period #{{no}}', { no: summary.period_no })
    : t('Bill')

  let content = <LoadingState />
  if (props.notFound) {
    content = <EmptyState title={t('Bill not found')} />
  } else if (context) {
    content = (
      <BillDetailContent
        context={context}
        scope={props.scope}
        onAckReconcile={props.onAckReconcile}
      />
    )
  }

  let statusBadge: ReactNode = null
  if (context?.bill) {
    statusBadge = <BillStatusBadge bill={context.bill} />
  } else if (context?.period) {
    const config = CREDIT_PERIOD_STATUSES[context.period.status]
    statusBadge = (
      <StatusBadge
        label={
          context.period.status === 'open'
            ? t('In progress')
            : t(config?.labelKey ?? context.period.status)
        }
        variant={config?.variant ?? 'info'}
        copyable={false}
      />
    )
  }

  return (
    <SectionPageLayout stackActionsOnMobile>
      <SectionPageLayout.Title>
        <span className='inline-flex flex-wrap items-center gap-2'>
          <span className='font-mono'>{title}</span>
          {summary && (
            <span className='text-muted-foreground text-sm font-normal'>
              {summary.enterprise_name}
            </span>
          )}
          {statusBadge}
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          {context?.bill && <InvoiceButton bill={context.bill} size='sm' />}
          {context?.bill && (
            <BillExportCsvButton
              bill={context.bill}
              scope={props.scope}
              size='sm'
            />
          )}
          {context && props.adminActions?.(context)}
          <Button variant='outline' size='sm' render={props.backLink}>
            <ArrowLeft className='h-4 w-4' />
            {t('Back to bills')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>{content}</SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
