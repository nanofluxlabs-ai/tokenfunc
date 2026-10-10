import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { PRICING_PLANS } from '../content'
import { useReveal } from '../hooks/use-reveal'
import {
  CheckList,
  Eyebrow,
  Section,
  SectionHeading,
} from './landing-primitives'

export function PricingSection(props: {
  registerEnabled: boolean
  onContactSales: () => void
}) {
  const { t } = useTranslation()
  const ref = useReveal<HTMLDivElement>()
  return (
    <Section id='pricing'>
      <div ref={ref} className='tf-reveal flex flex-col gap-12'>
        <SectionHeading
          eyebrow={t('Pricing')}
          title={t('Per-token billing, no monthly fee')}
        />
        <div className='grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4'>
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.key}
              className={cn(
                'bg-card flex flex-col gap-6 rounded-lg border p-8',
                plan.highlight ? 'border-input' : 'border-border'
              )}
            >
              <Eyebrow>{t(plan.eyebrow)}</Eyebrow>
              <span className='text-foreground text-5xl leading-none tracking-[-1.6px]'>
                {t(plan.price)}
                {plan.priceSuffix && (
                  <span className='text-muted-foreground ml-1.5 text-base tracking-normal'>
                    {t(plan.priceSuffix)}
                  </span>
                )}
              </span>
              <CheckList
                className='border-border flex-1 gap-3 border-t pt-6'
                items={plan.points.map((point) => t(point))}
              />
              {plan.key === 'enterprise' ? (
                <Button
                  size='lg'
                  className='h-12 text-[15px]'
                  onClick={props.onContactSales}
                >
                  {t(plan.cta)}
                </Button>
              ) : (
                <Button
                  size='lg'
                  variant='outline'
                  className='h-12 text-[15px]'
                  render={
                    props.registerEnabled ? (
                      <Link to='/sign-up' />
                    ) : (
                      <a href='#contact' />
                    )
                  }
                >
                  {props.registerEnabled
                    ? t(plan.cta)
                    : t('Request an enterprise trial')}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
