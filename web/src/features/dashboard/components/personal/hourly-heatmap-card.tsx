import { useMemo } from 'react'
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

import type { PersonalHeatmapCell } from '../../lib/personal-overview'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const HOUR_LABEL_STEP = 3

type HourlyHeatmapCardProps = {
  /** 按日期升序、每天 0~23 点依次排列 */
  cells: PersonalHeatmapCell[]
  loading: boolean
}

/** 单色系深浅：0 用底色，其余按与峰值之比在品牌色上加深 */
function cellBackground(count: number, peak: number): string {
  if (count <= 0 || peak <= 0) return 'var(--muted)'
  const strength = Math.round(18 + (count / peak) * 82)
  return `color-mix(in oklch, var(--chart-1) ${strength}%, var(--muted))`
}

/** 最近 7 天 × 24 小时请求分布（本地时区），夜间异常调用一眼可见；悬停看具体数值 */
export function HourlyHeatmapCard(props: HourlyHeatmapCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

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
              role='img'
              aria-label={t('Requests by hour, peak {{peak}} per hour', {
                peak: formatNumber(peak, locale),
              })}
              className='grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 gap-y-[3px] text-[10px]'
            >
              {days.map(([day, cells]) => (
                <div key={day} className='contents'>
                  <span className='text-muted-foreground self-center tabular-nums'>
                    {day.slice(5)}
                  </span>
                  <div className='grid grid-cols-24 gap-[3px]'>
                    {cells.map((cell) => (
                      <span
                        key={cell.hour}
                        className='aspect-square min-h-2 rounded-[3px]'
                        style={{
                          backgroundColor: cellBackground(cell.count, peak),
                        }}
                        title={t('{{day}} {{hour}}:00 · {{count}} requests', {
                          day: cell.day,
                          hour: String(cell.hour).padStart(2, '0'),
                          count: formatNumber(cell.count, locale),
                        })}
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
                  <span key={hour}>
                    {hour % HOUR_LABEL_STEP === 0 ? hour : ''}
                  </span>
                ))}
              </div>
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
