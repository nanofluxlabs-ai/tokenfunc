import { useLocation } from '@tanstack/react-router'
import { ExternalLink, Headset, Send, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

// 右下角是发送按钮的页面不显示入口，避免遮挡
const HIDDEN_PATH_PREFIXES = ['/playground', '/chat']

function isHiddenPath(pathname: string): boolean {
  return HIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  )
}

function WeChatPanel(props: { qrcodeUrl: string }) {
  const { t } = useTranslation()
  return (
    <div className='flex flex-col items-center gap-2'>
      <div className='size-44 rounded-lg bg-white p-2.5'>
        <img
          src={props.qrcodeUrl}
          alt={t('Sales WeChat QR code')}
          className='size-full object-contain'
        />
      </div>
      <p className='text-muted-foreground m-0 text-xs'>
        {t('Scan with WeChat to add sales')}
      </p>
    </div>
  )
}

function TelegramPanel(props: { username: string }) {
  const { t } = useTranslation()
  const link = `https://t.me/${props.username}`
  return (
    <div className='flex flex-col items-center gap-2'>
      <div className='size-44 rounded-lg bg-white p-2.5'>
        <QRCodeSVG
          value={link}
          className='size-full'
          aria-label={t('Sales Telegram QR code')}
        />
      </div>
      <p className='m-0 font-mono text-xs'>@{props.username}</p>
      {/* 外链跳转用原生链接（Base UI Button 渲染 a 时会带 button 角色） */}
      <a
        href={link}
        target='_blank'
        rel='noopener noreferrer'
        className={cn(buttonVariants({ size: 'sm' }), 'w-full')}
      >
        <Send className='size-4' aria-hidden='true' />
        {t('Open Telegram')}
        <ExternalLink className='size-3.5' aria-hidden='true' />
      </a>
    </div>
  )
}

/**
 * 全站右下角「联系商务」入口：商务微信二维码与 Telegram（系统设置 → 站点与品牌）。
 * 两者都没配置时不渲染；聊天、操练场页不显示。只能点击打开，手机与电脑行为一致。
 */
export function ContactSalesFab() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const pathname = useLocation({ select: (location) => location.pathname })
  const [open, setOpen] = useState(false)

  const qrcodeUrl =
    typeof status?.sales_qrcode === 'string' ? status.sales_qrcode : ''
  const telegram =
    typeof status?.sales_telegram === 'string' ? status.sales_telegram : ''
  if ((!qrcodeUrl && !telegram) || isHiddenPath(pathname)) return null

  let body: React.ReactNode
  if (qrcodeUrl && telegram) {
    body = (
      <Tabs defaultValue='wechat'>
        <TabsList className='grid w-full grid-cols-2'>
          <TabsTrigger value='wechat'>{t('WeChat')}</TabsTrigger>
          <TabsTrigger value='telegram'>Telegram</TabsTrigger>
        </TabsList>
        <TabsContent value='wechat' className='mt-3'>
          <WeChatPanel qrcodeUrl={qrcodeUrl} />
        </TabsContent>
        <TabsContent value='telegram' className='mt-3'>
          <TelegramPanel username={telegram} />
        </TabsContent>
      </Tabs>
    )
  } else if (qrcodeUrl) {
    body = <WeChatPanel qrcodeUrl={qrcodeUrl} />
  } else {
    body = <TelegramPanel username={telegram} />
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size='icon'
            aria-label={t('Contact sales')}
            title={t('Contact sales')}
            className='fixed right-4 bottom-4 z-40 size-12 rounded-full shadow-lg sm:right-6 sm:bottom-6'
          />
        }
      >
        {open ? (
          <X className='size-5' aria-hidden='true' />
        ) : (
          <Headset className='size-5' aria-hidden='true' />
        )}
      </PopoverTrigger>
      <PopoverContent
        side='top'
        align='end'
        sideOffset={12}
        collisionPadding={16}
        className='w-[min(18rem,calc(100vw-2rem))] gap-3 p-4'
      >
        <p className='m-0 text-sm font-medium'>{t('Contact sales')}</p>
        {body}
        <p className='text-muted-foreground m-0 border-t pt-2.5 text-center text-xs'>
          {t('Weekdays 9:00–21:00 · usually replies within 10 minutes')}
        </p>
      </PopoverContent>
    </Popover>
  )
}
