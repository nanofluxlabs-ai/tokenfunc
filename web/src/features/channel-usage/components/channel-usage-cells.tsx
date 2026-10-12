import { useTranslation } from 'react-i18next'

import {
  MetricTooltip,
  type MetricTooltipItem,
} from '@/features/finance/components/metric-tooltip'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'

/** 列表的价值单元：第一行 = 按官方价的产出价值，第二行 = 调用次数；悬浮显示 token 拆解与实际扣费 */
export function ChannelValueCell(props: {
  official: number
  actual: number
  prompt: number
  completion: number
  callCount: number
  locale?: string
}) {
  const { t } = useTranslation()
  const items: MetricTooltipItem[] = [
    {
      label: t('Input tokens'),
      value: formatNumber(props.prompt, props.locale),
    },
    {
      label: t('Output tokens'),
      value: formatNumber(props.completion, props.locale),
    },
    { label: t('Actual charge'), value: formatQuota(props.actual) },
  ]
  return (
    <MetricTooltip items={items}>
      <span className='font-mono text-sm font-semibold'>
        {formatQuota(props.official)}
      </span>
      <span className='text-muted-foreground text-xs'>
        {t('{{count}} calls', {
          count: formatCompactNumber(props.callCount, props.locale),
        })}
      </span>
    </MetricTooltip>
  )
}
