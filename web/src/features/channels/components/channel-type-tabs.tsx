import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChannelTypeLogo } from '@/features/channels/components/channel-type-badge'
import { getChannelTypeLabel } from '@/features/channels/lib/channel-utils'

type ChannelTypeTabsProps = {
  /** '' = 全部，否则为渠道类型数字的字符串 */
  value: string
  onValueChange: (value: string) => void
  availableTypes: number[]
  typeCounts: Record<string, number>
}

/** 顶部按渠道类型分 tab（带数量），与渠道列表的类型筛选同源数据 */
export function ChannelTypeTabs(props: ChannelTypeTabsProps) {
  const { t } = useTranslation()
  const activeKey = props.value === '' ? 'all' : props.value
  return (
    <Tabs
      value={activeKey}
      onValueChange={(value) =>
        props.onValueChange(value === 'all' ? '' : String(value))
      }
    >
      <TabsList
        variant='line'
        // 允许换行；上游触发器默认 h-[calc(100%-1px)] flex-1，列表高度为 auto 时百分比高度会算错、溢出到下方元素，这里固定触发器高度且不撑满整行
        className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto [&_[data-slot=tabs-trigger]]:h-7 [&_[data-slot=tabs-trigger]]:flex-none'
        aria-label={t('Channel type')}
      >
        <TabsTrigger value='all'>
          {t('All')}
          <Badge variant='secondary' className='ml-1'>
            {props.typeCounts.all ?? 0}
          </Badge>
        </TabsTrigger>
        {props.availableTypes.map((type) => (
          <TabsTrigger key={type} value={String(type)}>
            <ChannelTypeLogo type={type} size={14} />
            {t(getChannelTypeLabel(type))}
            <Badge variant='secondary' className='ml-1'>
              {props.typeCounts[String(type)] ?? 0}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
