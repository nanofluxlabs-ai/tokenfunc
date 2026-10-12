import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatTimestampToDate } from '@/lib/format'

import {
  isExternalChannel,
  type ChannelHealthValue,
} from '../lib/channel-health'
import type { Channel } from '../types'

type HealthDimensionBadgeProps = {
  label: string
  health: ChannelHealthValue
  lastProbeAt: number
  lastError: string
  failCount: number
}

/** 单个维度的「↑ / ↓」徽标；unknown（从未探测）不显示 */
function HealthDimensionBadge(props: HealthDimensionBadgeProps) {
  const { t } = useTranslation()
  if (props.health === 'unknown') {
    return null
  }
  const failed = props.health === 'failed'
  const label = `${props.label} ${failed ? '↓' : '↑'}`
  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <StatusBadge
            label={label}
            variant={failed ? 'danger' : 'success'}
            size='sm'
            copyable={false}
            aria-label={
              failed
                ? t('{{dimension}} unavailable', { dimension: props.label })
                : t('{{dimension}} available', { dimension: props.label })
            }
          />
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-xs'>
          <div className='space-y-1 text-xs'>
            <div>
              {failed
                ? t('Last probe failed; dispatch is paused on this channel.')
                : t('Last probe succeeded.')}
            </div>
            {props.lastProbeAt > 0 && (
              <div>
                {t('Time:')} {formatTimestampToDate(props.lastProbeAt)}
              </div>
            )}
            {props.failCount > 0 && (
              <div>
                {t('Consecutive failures:')} {props.failCount}
              </div>
            )}
            {props.lastError && (
              <div className='wrap-anywhere'>
                {t('Reason:')} {props.lastError}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** 渠道名称下方的外部渠道徽标行：外部 / 接口 ↑↓ / 推理 ↑↓（TokenFunc 二开） */
export function ChannelHealthBadges(props: { channel: Channel }) {
  const { t } = useTranslation()
  if (!isExternalChannel(props.channel)) {
    return null
  }
  const state = props.channel.health_state
  return (
    <div className='flex flex-wrap items-center gap-1'>
      <TooltipProvider delay={100}>
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <StatusBadge
              label={t('External')}
              variant='orange'
              size='sm'
              copyable={false}
            />
          </TooltipTrigger>
          <TooltipContent side='top' className='max-w-xs'>
            {t(
              'External channel: probed separately for API and inference availability; dispatch pauses while either fails.'
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {state && (
        <>
          <HealthDimensionBadge
            label={t('API')}
            health={state.api_health}
            lastProbeAt={state.last_api_probe_at}
            lastError={state.last_api_error}
            failCount={state.api_fail_count}
          />
          <HealthDimensionBadge
            label={t('Inference')}
            health={state.inference_health}
            lastProbeAt={state.last_inference_probe_at}
            lastError={state.last_inference_error}
            failCount={state.inference_fail_count}
          />
        </>
      )}
    </div>
  )
}
