import { useState } from 'react'

import { useStatus } from '@/hooks/use-status'

import { Capabilities } from './components/capabilities'
import { ContactSection } from './components/contact-section'
import { FaqSection } from './components/faq-section'
import { Hero } from './components/hero'
import { ModelsSection } from './components/models-section'
import { QualityStrip } from './components/quality-strip'
import { Quickstart } from './components/quickstart'
import { SalesQrDialog } from './components/sales-qr-dialog'

/**
 * tokenfunc 营销页（面向企业客户），七个区块：
 * Hero → 三个主卖点 → 运行质量 → 接入 → 价目 → 常见问题 → 试用表单。
 * 页头/页脚由上游 PublicLayout 与 Footer 提供，这里只负责首屏到试用表单。
 */
export function Landing() {
  const { status } = useStatus()
  const [salesOpen, setSalesOpen] = useState(false)
  const registerEnabled =
    !status?.self_use_mode_enabled && status?.register_enabled !== false
  const salesQrCodeUrl =
    typeof status?.sales_qrcode === 'string' ? status.sales_qrcode : ''

  return (
    <>
      <Hero registerEnabled={registerEnabled} />
      <Capabilities />
      <QualityStrip />
      <Quickstart />
      <ModelsSection />
      <FaqSection />
      {/* 未配置商务微信二维码时，「直接加商务微信」按钮整体隐藏 */}
      <ContactSection
        onContactSales={() => setSalesOpen(true)}
        salesQrConfigured={Boolean(salesQrCodeUrl)}
      />
      <SalesQrDialog
        open={salesOpen}
        onOpenChange={setSalesOpen}
        qrCodeUrl={salesQrCodeUrl}
      />
    </>
  )
}
