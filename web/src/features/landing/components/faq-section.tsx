import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { FAQ_ITEMS } from '../content'
import { useReveal } from '../hooks/use-reveal'
import { Section, SectionHeading } from './landing-primitives'

export function FaqSection() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(0)
  const ref = useReveal<HTMLDivElement>()
  return (
    <Section id='faq'>
      <div ref={ref} className='tf-reveal flex flex-wrap items-start gap-16'>
        <SectionHeading
          className='flex-[1_1_240px]'
          eyebrow='FAQ'
          title={t('Frequently asked questions')}
        />
        <div className='border-border flex min-w-0 flex-[2_1_520px] flex-col border-t'>
          {FAQ_ITEMS.map((item, index) => {
            const expanded = open === index
            const panelId = `landing-faq-${index}`
            return (
              <div key={item.question} className='border-border border-b'>
                <button
                  type='button'
                  className='text-foreground flex w-full cursor-pointer items-center justify-between gap-4 bg-transparent py-5.5 text-left text-lg tracking-[-0.3px]'
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? -1 : index)}
                >
                  {t(item.question)}
                  <Plus
                    aria-hidden='true'
                    className={cn(
                      'text-muted-foreground size-4 shrink-0 transition-transform duration-200',
                      expanded && 'rotate-45'
                    )}
                  />
                </button>
                {expanded && (
                  <p
                    id={panelId}
                    className='text-foreground/90 m-0 pr-2 pb-6 text-[15px] leading-[26px] text-pretty sm:pr-12'
                  >
                    {t(item.answer)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}
