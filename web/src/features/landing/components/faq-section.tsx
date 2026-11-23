import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Markdown } from '@/components/ui/markdown'
import { useStatus } from '@/hooks/use-status'
import { normalizeInterfaceLanguage } from '@/i18n/languages'

import { useReveal } from '../hooks/use-reveal'
import { pickLandingFaq } from '../lib/landing-faq'
import { Eyebrow } from './landing-primitives'

/**
 * 常见问题：内容与控制台概览的「常见问答」共用（系统设置里维护，改动不用发版）；
 * 非中文界面或后台没填时显示 content.ts 里的内置默认问答。
 */
export function FaqSection() {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const ref = useReveal<HTMLDivElement>()
  const faq = pickLandingFaq({
    language: normalizeInterfaceLanguage(
      i18n.resolvedLanguage || i18n.language
    ),
    enabled: status?.faq_enabled,
    consoleItems: status?.faq,
  })
  const translate = (text: string) =>
    faq.source === 'builtin' ? t(text) : text

  return (
    <section id='faq' className='border-border scroll-mt-16 border-t'>
      <div
        ref={ref}
        className='tf-reveal mx-auto flex max-w-[1200px] flex-wrap items-start gap-x-16 gap-y-8 px-[clamp(20px,5vw,32px)] py-[clamp(72px,9vw,112px)]'
      >
        <div className='flex flex-[1_1_240px] flex-col gap-4'>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className='text-foreground m-0 text-[clamp(28px,3.4vw,36px)] leading-[1.2] font-medium tracking-[-0.02em]'>
            {t('Frequently asked questions')}
          </h2>
        </div>
        <Accordion className='border-border min-w-0 flex-[2_1_520px] border-t'>
          {faq.items.map((item, index) => (
            <AccordionItem
              key={item.question}
              value={`faq-${index}`}
              className='border-border'
            >
              <AccordionTrigger className='text-foreground py-5 text-start text-lg font-normal tracking-[-0.3px] hover:no-underline'>
                {translate(item.question)}
              </AccordionTrigger>
              <AccordionContent>
                <Markdown className='text-foreground/90 pr-2 pb-2 text-[15px] leading-[26px] sm:pr-12'>
                  {translate(item.answer)}
                </Markdown>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
