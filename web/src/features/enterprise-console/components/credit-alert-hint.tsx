import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'

type CreditAlertHintProps = {
  /** 预警阈值（已用占额度百分比），0 表示关闭 */
  alertPercent: number
  /** 当前已用百分比（未钳制） */
  usedPercent: number
}

/** 授信进度条下方的预警说明：阈值 + 达到后的徽标；阈值为 0 时不渲染 */
export function CreditAlertHint(props: CreditAlertHintProps) {
  const { t } = useTranslation()
  if (props.alertPercent <= 0) return null
  let badge: React.ReactNode = null
  if (props.usedPercent >= 100) {
    badge = (
      <StatusBadge
        label={t('Limit exhausted')}
        variant='danger'
        copyable={false}
      />
    )
  } else if (props.usedPercent >= props.alertPercent) {
    badge = (
      <StatusBadge
        label={t('Alert threshold reached')}
        variant='warning'
        copyable={false}
      />
    )
  }
  return (
    <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs'>
      <span>
        {t(
          'Alert threshold {{percent}}% · billing email is notified when reached',
          { percent: props.alertPercent }
        )}
      </span>
      {badge}
    </div>
  )
}
