import { VChart } from '@visactor/react-vchart'
import { useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useMediaQuery } from '@/hooks/use-media-query'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { useChartTheme } from '@/lib/use-chart-theme'
import { cn } from '@/lib/utils'
import { VCHART_OPTION } from '@/lib/vchart'

import {
  USAGE_DONUT_TOP,
  usageOthersColor,
  usagePalette,
} from '../lib/usage-chart-palette'
import { sharePercent } from '../lib/usage-range'

export type UsageChartSlice = { name: string; quota: number }

type UsageChartProps = {
  id: string
  /** 已按消耗倒序 */
  data: UsageChartSlice[]
  className?: string
}

/** 环形图可按切片指定颜色（调用方已按实体固定配色时用），缺省走品牌色板 */
type UsageDonutChartProps = UsageChartProps & { colors?: string[] }

const RANK_TOP = 10

/** 主题就绪且有数据才画图，否则显示占位（jsdom 下 themeReady 为 false） */
function ThemedChart(props: {
  id: string
  spec: Record<string, unknown> | null
  className?: string
}) {
  const { t } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  return (
    <div className={props.className}>
      {themeReady && props.spec ? (
        <VChart
          key={`${props.id}-${resolvedTheme}`}
          spec={{
            ...props.spec,
            theme: resolvedTheme === 'dark' ? 'dark' : 'light',
            background: 'transparent',
          }}
          option={VCHART_OPTION}
        />
      ) : (
        <div className='text-muted-foreground/80 flex h-full items-center justify-center text-xs'>
          {t('No consumption in this range')}
        </div>
      )}
    </div>
  )
}

/** 消耗构成环形图：前 6 项 + 其他，中心显示合计；不画图例，名称看旁边明细表 */
export function UsageDonutChart(props: UsageDonutChartProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useChartTheme()
  const reduceMotion = useReducedMotion()
  const textColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.68)'
      : 'rgba(15, 23, 42, 0.58)'
  const spec = useMemo(() => {
    const total = props.data.reduce((sum, item) => sum + item.quota, 0)
    if (total <= 0) return null
    const head = props.data.slice(0, USAGE_DONUT_TOP)
    const restQuota = props.data
      .slice(USAGE_DONUT_TOP)
      .reduce((sum, item) => sum + item.quota, 0)
    const values = head.map((item) => ({ name: item.name, quota: item.quota }))
    if (restQuota > 0) values.push({ name: t('Others'), quota: restQuota })
    return {
      type: 'pie',
      data: [{ id: props.id, values }],
      valueField: 'quota',
      categoryField: 'name',
      // 颜色与明细表的色点一一对应：前 N 项取品牌色，「其他」固定灰
      color: props.colors ?? [
        ...usagePalette(resolvedTheme === 'dark'),
        usageOthersColor(resolvedTheme === 'dark'),
      ],
      outerRadius: 0.92,
      innerRadius: 0.68,
      padAngle: 0.6,
      pie: {
        style: { cornerRadius: 4 },
        state: { hover: { outerRadius: 0.96 } },
      },
      label: { visible: false },
      // 图例由旁边的明细表承担（名称前有同色色点）
      legends: { visible: false },
      indicator: {
        visible: true,
        trigger: 'none',
        title: {
          visible: true,
          style: { text: t('Total'), fontSize: 12, fill: textColor },
        },
        content: [
          {
            visible: true,
            style: {
              text: formatQuotaWithCurrency(total),
              fontSize: 18,
              fontWeight: 600,
            },
          },
        ],
      },
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: Record<string, unknown>) =>
                String(datum?.name ?? ''),
              value: (datum: Record<string, unknown>) => {
                const quota = Number(datum?.quota) || 0
                return `${formatQuotaWithCurrency(quota)} (${sharePercent(quota, total)}%)`
              },
            },
          ],
        },
      },
      // 入场：曲线 / 扇区 / 条形以 0.8 秒缓出生长；系统要求减少动态效果时关闭
      animation: !reduceMotion,
      animationAppear: { duration: 800, easing: 'cubicOut' },
    }
  }, [
    props.colors,
    props.data,
    props.id,
    reduceMotion,
    resolvedTheme,
    t,
    textColor,
  ])

  return (
    <ThemedChart
      id={props.id}
      spec={spec}
      className={cn('h-64', props.className)}
    />
  )
}

/** 消耗排行横向条形图：前 10 项，按消耗从高到低自上而下 */
export function UsageRankChart(props: UsageChartProps) {
  const { resolvedTheme } = useChartTheme()
  const reduceMotion = useReducedMotion()
  // 手机上标签收窄，给条形留出宽度
  const isMobile = useMediaQuery('(max-width: 640px)')
  const labelLimit = isMobile ? 80 : 140
  const textColor =
    resolvedTheme === 'dark'
      ? 'rgba(255, 255, 255, 0.68)'
      : 'rgba(15, 23, 42, 0.58)'
  const values = useMemo(
    () => props.data.filter((item) => item.quota > 0).slice(0, RANK_TOP),
    [props.data]
  )
  const spec = useMemo(() => {
    if (values.length === 0) return null
    const color =
      (typeof document !== 'undefined' &&
        getComputedStyle(document.body).getPropertyValue('--chart-1').trim()) ||
      '#1db954'
    return {
      type: 'bar',
      direction: 'horizontal',
      data: [{ id: props.id, values }],
      xField: 'quota',
      yField: 'name',
      color: [color],
      bar: { style: { cornerRadius: [0, 4, 4, 0] } },
      barMaxWidth: 18,
      label: {
        visible: true,
        position: 'outside',
        formatMethod: (_: unknown, datum: Record<string, unknown>) =>
          formatQuotaWithCurrency(Number(datum?.quota) || 0),
        style: { fill: textColor, fontSize: 11 },
      },
      axes: [
        {
          orient: 'left',
          type: 'band',
          inverse: false,
          label: {
            style: { fill: textColor, fontSize: 11 },
            autoLimit: true,
            limitLength: labelLimit,
          },
          tick: { visible: false },
          domainLine: { visible: false },
        },
        {
          orient: 'bottom',
          visible: false,
          grid: { visible: false },
          // 给最长的条留出右侧空间，金额标签才能放在条外，不被挤进条内描边显示
          expand: { max: 0.2 },
        },
      ],
      tooltip: {
        mark: {
          content: [
            {
              key: (datum: Record<string, unknown>) =>
                String(datum?.name ?? ''),
              value: (datum: Record<string, unknown>) =>
                formatQuotaWithCurrency(Number(datum?.quota) || 0),
            },
          ],
        },
      },
      // 入场：曲线 / 扇区 / 条形以 0.8 秒缓出生长；系统要求减少动态效果时关闭
      animation: !reduceMotion,
      animationAppear: { duration: 800, easing: 'cubicOut' },
    }
  }, [props.id, reduceMotion, textColor, values, labelLimit])

  return (
    <ThemedChart
      id={props.id}
      spec={spec}
      className={cn(values.length > 5 ? 'h-80' : 'h-52', props.className)}
    />
  )
}
