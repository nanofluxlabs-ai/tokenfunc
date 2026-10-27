import { type MouseEvent, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { PersonalHeatmapCell } from '../../lib/personal-overview'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const HOUR_LABEL_STEP = 3
/** 入场时按列（小时）错峰，每列延迟毫秒数；24 列总计约 0.5 秒 */
const COLUMN_DELAY_MS = 20

type HourlyHeatmapCardProps = {
  /** 按日期升序、每天 0~23 点依次排列 */
  cells: PersonalHeatmapCell[]
  loading: boolean
}

type HoveredCell = PersonalHeatmapCell & { left: number; top: number }

/** 单色系深浅：0 用底色，其余按与峰值之比在品牌色上加深 */
function cellBackground(count: number, peak: number): string {
  if (count <= 0 || peak <= 0) return 'var(--muted)'
  const strength = Math.round(18 + (count / peak) * 82)
  return `color-mix(in oklch, var(--chart-1) ${strength}%, var(--muted))`
}

/** 最近 7 天 × 24 小时请求分布（本地时区），夜间异常调用一眼可见；悬停格子浮出明细 */
export function HourlyHeatmapCard(props: HourlyHeatmapCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const gridRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<HoveredCell | null>(null)

  const { days, peak, total } = useMemo(() => {
    const byDay = new Map<string, PersonalHeatmapCell[]>()
    let max = 0
    let sum = 0
    for (const cell of props.cells) {
      const list = byDay.get(cell.day) ?? []
      list.push(cell)
      byDay.set(cell.day, list)
      max = Math.max(max, cell.count)
      sum += cell.count
    }
    return { days: [...byDay.entries()], peak: max, total: sum }
  }, [props.cells])

  // 浮层定位在格子正上方，坐标相对网格容器
  const handleEnter = (
    event: MouseEvent<HTMLSpanElement>,
    cell: PersonalHeatmapCell
  ) => {
    const container = gridRef.current?.getBoundingClientRect()
    const rect = event.currentTarget.getBoundingClientRect()
    if (!container) return
    setHovered({
      ...cell,
      left: rect.left - container.left + rect.width / 2,
      top: rect.top - container.top,
    })
  }

  let tooltipAlign = '-translate-x-1/2'
  if (hovered && hovered.hour < 3) tooltipAlign = '-translate-x-1/4'
  if (hovered && hovered.hour > 20) tooltipAlign = '-translate-x-3/4'

  return (
    <Card className='h-full min-w-0'>
      <CardHeader>
        <CardTitle>{t('Requests by hour')}</CardTitle>
        <CardDescription>
          {t('Last 7 days, local time; hover a cell for details')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <Skeleton className='h-52' />
        ) : (
          <div className='flex flex-col gap-2'>
            <div
              ref={gridRef}
              role='img'
              aria-label={t('Requests by hour, peak {{peak}} per hour', {
                peak: formatNumber(peak, locale),
              })}
              className='relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 gap-y-[3px] text-[10px]'
              onMouseLeave={() => setHovered(null)}
            >
              {days.map(([day, cells]) => (
                <div key={day} className='contents'>
                  <span
                    className={cn(
                      'text-muted-foreground self-center tabular-nums transition-colors',
                      hovered?.day === day && 'text-foreground font-medium'
                    )}
                  >
                    {day.slice(5)}
                  </span>
                  <div className='grid grid-cols-24 gap-[3px]'>
                    {cells.map((cell) => (
                      <span
                        key={cell.hour}
                        className={cn(
                          'animate-in fade-in zoom-in-50 fill-mode-both aspect-square min-h-2 rounded-[3px] duration-300 motion-reduce:animate-none',
                          'transition-shadow',
                          hovered?.day === cell.day &&
                            hovered.hour === cell.hour &&
                            'ring-foreground/70 ring-2 ring-offset-1 ring-offset-transparent'
                        )}
                        style={{
                          backgroundColor: cellBackground(cell.count, peak),
                          animationDelay: `${cell.hour * COLUMN_DELAY_MS}ms`,
                        }}
                        onMouseEnter={(event) => handleEnter(event, cell)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <span aria-hidden='true' />
              <div
                className='text-muted-foreground grid grid-cols-24 gap-[3px] tabular-nums'
                aria-hidden='true'
              >
                {HOURS.map((hour) => (
                  <span
                    key={hour}
                    className={cn(
                      hovered?.hour === hour && 'text-foreground font-medium'
                    )}
                  >
                    {hour % HOUR_LABEL_STEP === 0 || hovered?.hour === hour
                      ? hour
                      : ''}
                  </span>
                ))}
              </div>

              {hovered && (
                <div
                  role='status'
                  className={cn(
                    'bg-popover text-popover-foreground pointer-events-none absolute z-10 -translate-y-full rounded-md border px-2 py-1 text-[11px] whitespace-nowrap shadow-md',
                    tooltipAlign
                  )}
                  style={{ left: hovered.left, top: hovered.top - 6 }}
                >
                  <span className='text-muted-foreground'>
                    {`${hovered.day} ${String(hovered.hour).padStart(2, '0')}:00`}
                  </span>
                  <span className='text-muted-foreground'> · </span>
                  <span className='font-medium tabular-nums'>
                    {t('{{value}} requests', {
                      value: formatNumber(hovered.count, locale),
                    })}
                  </span>
                </div>
              )}
            </div>
            <div className='text-muted-foreground flex items-center justify-between gap-3 text-xs'>
              <span className='tabular-nums'>
                {t('{{value}} requests in 7 days', {
                  value: formatNumber(total, locale),
                })}
              </span>
              <span className='flex items-center gap-1.5' aria-hidden='true'>
                {t('Less')}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <span
                    key={ratio}
                    className='size-2.5 rounded-[3px]'
                    style={{ backgroundColor: cellBackground(ratio, 1) }}
                  />
                ))}
                {t('More')}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
