import { useState } from 'react'

import { useStatus } from '@/hooks/use-status'

import { Capabilities } from './components/capabilities'
import { ContactSection } from './components/contact-section'
import { EnterpriseSection } from './components/enterprise-section'
import { FaqSection } from './components/faq-section'
import { Hero } from './components/hero'
import { ModelsSection } from './components/models-section'
import { PricingSection } from './components/pricing-section'
import { Quickstart } from './components/quickstart'
import { SalesQrDialog } from './components/sales-qr-dialog'

/**
 * tokenfunc 营销页（面向企业客户）。
 * 页头/页脚由上游 PublicLayout 与 Footer 提供，这里只负责首屏到联系表单的各个区块。
 */
export function Landing() {
  const { status } = useStatus()
  const [salesOpen, setSalesOpen] = useState(false)
  const registerEnabled =
    !status?.self_use_mode_enabled && status?.register_enabled !== false
  const salesQrCodeUrl =
    typeof status?.sales_qrcode === 'string' ? status.sales_qrcode : ''

  const contactSales = () => {
    if (salesQrCodeUrl) {
      setSalesOpen(true)
      return
    }
    document
      .querySelector('#contact')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <Hero registerEnabled={registerEnabled} />
      <Capabilities />
      <EnterpriseSection />
      <Quickstart />
      <ModelsSection />
      <PricingSection
        registerEnabled={registerEnabled}
        onContactSales={contactSales}
      />
      <FaqSection />
      <ContactSection
        onContactSales={contactSales}
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
