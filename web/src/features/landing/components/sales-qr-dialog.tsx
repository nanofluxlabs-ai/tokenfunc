import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'

import { Eyebrow } from './landing-primitives'

/** 联系销售：展示后台配置的商务微信二维码（系统设置 → 站点与品牌） */
export function SalesQrDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  qrCodeUrl: string
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Scan to reach sales on WeChat')}
      description={t('Weekdays 9:00–21:00 · usually replies within 10 minutes')}
      contentClassName='max-w-sm'
      contentHeight='auto'
      bodyClassName='flex flex-col items-center gap-4'
    >
      <Eyebrow>{t('Contact sales')}</Eyebrow>
      {props.qrCodeUrl ? (
        <div className='size-[200px] rounded-lg bg-white p-3'>
          <img
            src={props.qrCodeUrl}
            alt={t('Sales WeChat QR code')}
            className='size-full object-contain'
          />
        </div>
      ) : (
        <p className='text-muted-foreground m-0 text-center text-sm'>
          {t(
            'The sales QR code has not been configured yet. Please use the trial request form instead.'
          )}
        </p>
      )}
    </Dialog>
  )
}
