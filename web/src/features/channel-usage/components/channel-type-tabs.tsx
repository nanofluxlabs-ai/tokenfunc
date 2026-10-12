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
        className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'
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
