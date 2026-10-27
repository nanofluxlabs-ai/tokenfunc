import { motion, useReducedMotion } from 'motion/react'
import {
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useMemo,
  useState,
} from 'react'

import { cn } from '@/lib/utils'

export type SparklinePoint = {
  /** 提示框里的标签，如 10-26 */
  label: string
  value: number
}

export type SparklineTone = 'accent-1' | 'accent-2' | 'accent-3'

type InteractiveSparklineProps = {
  points: SparklinePoint[]
  /** 提示框数值的格式化 */
  format: (value: number) => string
  variant?: 'line' | 'bars'
  tone?: SparklineTone
  /** 读屏摘要，如「近 7 天今日消耗」 */
  ariaLabel: string
  /** 放在整卡链接里时关掉键盘焦点，避免链接内嵌可聚焦元素 */
  focusable?: boolean
}

const TONE_TEXT: Record<SparklineTone, string> = {
  'accent-1': 'text-overview-accent-1',
  'accent-2': 'text-overview-accent-2',
  'accent-3': 'text-overview-accent-3',
}

const VIEW_WIDTH = 160
const VIEW_HEIGHT = 36
const PADDING = 3
const EASE_OUT_CUBIC = [0.33, 1, 0.68, 1] as const

/** 每个点在 0~1 坐标系里的位置（x 从左到右，y 从上到下） */
function layoutPoints(values: number[]): Array<{ x: number; y: number }> {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min
  const usable = (VIEW_HEIGHT - PADDING * 2) / VIEW_HEIGHT
  return values.map((value, index) => {
    const x = values.length === 1 ? 0.5 : index / (values.length - 1)
    let normalized = 0
    if (range > 0) normalized = (value - min) / range
    else if (max > 0) normalized = 0.5
    return { x, y: 1 - PADDING / VIEW_HEIGHT - normalized * usable }
  })
}

/**
 * KPI 卡迷你图：入场时描线 / 柱子长出；指针悬停或方向键切换时吸附到最近的数据点，
 * 显示参考线、高亮点和「标签 · 数值」提示框。视觉沿用 StatCard 内置迷你图。
 */
export function InteractiveSparkline(props: InteractiveSparklineProps) {
  const reduceMotion = useReducedMotion()
  const gradientId = `sparkline-${useId().replaceAll(':', '')}`
  const [active, setActive] = useState<number | null>(null)
  const variant = props.variant ?? 'line'
  const values = useMemo(
    () => props.points.map((point) => Math.max(0, Number(point.value) || 0)),
    [props.points]
  )
  const layout = useMemo(() => layoutPoints(values), [values])

  if (props.points.length === 0) {
    return <div className='h-8' aria-hidden='true' />
  }

  const count = props.points.length
  const pickIndex = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    )
    const index =
      variant === 'bars'
        ? Math.min(count - 1, Math.floor(ratio * count))
        : Math.round(ratio * (count - 1))
    setActive(index)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowLeft' ? -1 : 1
    setActive((current) =>
      Math.min(count - 1, Math.max(0, (current ?? count - 1) + step))
    )
  }

  // 柱状时提示框对准柱子中心，折线时对准数据点
  const anchorX = (index: number) =>
    variant === 'bars' ? (index + 0.5) / count : layout[index].x
  const activePoint = active === null ? null : props.points[active]
  // 靠近两端时提示框改为左 / 右对齐，避免超出卡片
  let tooltipAlign = '-translate-x-1/2'
  if (active !== null && anchorX(active) < 0.2) {
    tooltipAlign = 'translate-x-0'
  } else if (active !== null && anchorX(active) > 0.8) {
    tooltipAlign = '-translate-x-full'
  }

  const linePath = layout
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x * VIEW_WIDTH} ${point.y * VIEW_HEIGHT}`
    )
    .join(' ')
  const firstX = (layout.at(0)?.x ?? 0) * VIEW_WIDTH
  const lastX = (layout.at(-1)?.x ?? 1) * VIEW_WIDTH
  const areaPath = `${linePath} L ${lastX} ${VIEW_HEIGHT} L ${firstX} ${VIEW_HEIGHT} Z`
  const maxValue = Math.max(...values)

  return (
    <div
      role='img'
      aria-label={props.ariaLabel}
      tabIndex={props.focusable === false ? undefined : 0}
      className={cn(
        'focus-visible:ring-ring relative h-8 rounded-lg outline-none focus-visible:ring-2',
        TONE_TEXT[props.tone ?? 'accent-1']
      )}
      onPointerMove={pickIndex}
      onPointerLeave={() => setActive(null)}
      onFocus={() => setActive(count - 1)}
      onBlur={() => setActive(null)}
      onKeyDown={handleKeyDown}
    >
      {variant === 'line' ? (
        // 入场用裁剪从左到右展开：pathLength 与 non-scaling-stroke 在拉伸的 viewBox 下虚线长度对不上，线会画不完
        <motion.svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio='none'
          className='size-full overflow-visible'
          aria-hidden='true'
          initial={
            reduceMotion ? false : { clipPath: 'inset(-20% 100% -20% 0)' }
          }
          animate={{ clipPath: 'inset(-20% 0% -20% 0)' }}
          transition={{ duration: 0.9, ease: EASE_OUT_CUBIC }}
        >
          <defs>
            <linearGradient id={gradientId} x1='0' x2='0' y1='0' y2='1'>
              <stop offset='0%' stopColor='currentColor' stopOpacity='0.24' />
              <stop offset='100%' stopColor='currentColor' stopOpacity='0' />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill='none'
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='2.25'
            vectorEffect='non-scaling-stroke'
          />
        </motion.svg>
      ) : (
        <div className='flex h-full items-end gap-1' aria-hidden='true'>
          {values.map((value, index) => {
            const height =
              maxValue > 0 ? Math.max(8, (value / maxValue) * 100) : 0
            return (
              <motion.span
                key={props.points[index].label}
                className={cn(
                  'flex-1 origin-bottom rounded-t-sm bg-current transition-opacity',
                  active !== null && active !== index
                    ? 'opacity-35'
                    : 'opacity-80',
                  height <= 0 && 'opacity-20'
                )}
                style={{ height: `${height}%` }}
                initial={reduceMotion ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.05,
                  ease: EASE_OUT_CUBIC,
                }}
              />
            )
          })}
        </div>
      )}

      {active !== null && activePoint && (
        <>
          {variant === 'line' && (
            <>
              <span
                className='pointer-events-none absolute inset-y-0 w-px bg-current opacity-30'
                style={{ left: `${layout[active].x * 100}%` }}
                aria-hidden='true'
              />
              <span
                className='bg-card pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-current'
                style={{
                  left: `${layout[active].x * 100}%`,
                  top: `${layout[active].y * 100}%`,
                }}
                aria-hidden='true'
              />
            </>
          )}
          <div
            role='status'
            className={cn(
              'bg-popover text-popover-foreground pointer-events-none absolute bottom-full z-10 mb-1.5 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap shadow-md',
              tooltipAlign
            )}
            style={{ left: `${anchorX(active) * 100}%` }}
          >
            <span className='text-muted-foreground'>{activePoint.label}</span>
            <span className='text-muted-foreground'> · </span>
            <span className='font-medium tabular-nums'>
              {props.format(activePoint.value)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
