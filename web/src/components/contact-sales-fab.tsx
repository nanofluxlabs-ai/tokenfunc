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

const FAB_ICON_CLASS =
  'absolute inset-0 size-5 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none'

// 切换微信 / Telegram 时内容淡入并轻微上移
const TAB_PANEL_CLASS =
  'animate-in fade-in-0 slide-in-from-bottom-1 mt-3 duration-200 motion-reduce:animate-none'

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
        <TabsContent value='wechat' className={TAB_PANEL_CLASS}>
          <WeChatPanel qrcodeUrl={qrcodeUrl} />
        </TabsContent>
        <TabsContent value='telegram' className={TAB_PANEL_CLASS}>
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
            // 悬停微放大、按下回弹；减少动态效果的系统设置下不做位移动画
            className='fixed right-4 bottom-4 z-40 size-12 rounded-full shadow-lg transition-[transform,box-shadow] duration-200 ease-out hover:scale-105 hover:shadow-xl active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 sm:right-6 sm:bottom-6'
          />
        }
      >
        {/* 两个图标叠放，打开时耳机旋出、关闭符号旋入，交叉淡入淡出 */}
        <span className='relative size-5' aria-hidden='true'>
          <Headset
            className={cn(
              FAB_ICON_CLASS,
              open ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0'
            )}
          />
          <X
            className={cn(
              FAB_ICON_CLASS,
              open ? 'scale-100 rotate-0' : 'scale-50 -rotate-90 opacity-0'
            )}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent
        side='top'
        align='end'
        sideOffset={12}
        collisionPadding={16}
        // 从按钮方向（右下角）缩放展开，时长比默认的 100ms 稍长，收起更快
        className='data-open:zoom-in-90 w-[min(18rem,calc(100vw-2rem))] gap-3 p-4 ease-out data-closed:duration-150 data-open:duration-200 motion-reduce:animate-none'
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
