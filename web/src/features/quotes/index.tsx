import { useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { PricingModel } from '@/features/pricing/types'
import { handleServerError } from '@/lib/handle-server-error'

import { createQuote } from './api'
import { ModelPicker } from './components/model-picker'
import { QuoteItemsTable } from './components/quote-items-table'
import { QuotesHistory } from './components/quotes-history'
import { openQuotePrintWindow } from './lib/quote-html'
import { computeListPrices } from './lib/quote-pricing'
import type { QuoteItemInput } from './types'

type QuoteHeader = {
  customer_name: string
  customer_contact: string
  customer_email: string
  discount_percent: number
  valid_days: number
  notes: string
}

const EMPTY_HEADER: QuoteHeader = {
  customer_name: '',
  customer_contact: '',
  customer_email: '',
  discount_percent: 0,
  valid_days: 30,
  notes: '',
}

export function Quotes() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [header, setHeader] = useState<QuoteHeader>(EMPTY_HEADER)
  const [group, setGroup] = useState('default')
  const [items, setItems] = useState<QuoteItemInput[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const selected = new Set(items.map((item) => item.model_name))

  const toggleModel = (
    model: PricingModel,
    groupRatio: number,
    selectedGroup: string
  ) => {
    setItems((current) => {
      if (current.some((item) => item.model_name === model.model_name)) {
        return current.filter((item) => item.model_name !== model.model_name)
      }
      const prices = computeListPrices(model, groupRatio)
      return [
        ...current,
        {
          model_name: model.model_name,
          vendor_name: model.vendor_name ?? '',
          group: selectedGroup,
          input_usd: prices.input,
          output_usd: prices.output,
          cache_usd: prices.cache ?? 0,
          discount_percent: 0,
          note: '',
        },
      ]
    })
  }

  const handleGenerate = async () => {
    if (header.customer_name.trim() === '') {
      toast.error(t('Customer name is required'))
      return
    }
    if (items.length === 0) {
      toast.error(t('Pick at least one model'))
      return
    }
    setIsSubmitting(true)
    try {
      const validUntil =
        header.valid_days > 0
          ? Math.floor(Date.now() / 1000) + header.valid_days * 86400
          : 0
      const result = await createQuote({
        customer_name: header.customer_name.trim(),
        customer_contact: header.customer_contact.trim(),
        customer_email: header.customer_email.trim(),
        discount_percent: header.discount_percent,
        valid_until: validUntil,
        notes: header.notes,
        items,
      })
      if (!result.success || !result.data) {
        handleServerError(result)
        return
      }
      toast.success(
        t('Quote {{quoteNo}} generated', { quoteNo: result.data.quote_no })
      )
      void queryClient.invalidateQueries({ queryKey: ['admin-quotes'] })
      if (!openQuotePrintWindow(result.data, t)) {
        toast.error(t('Please allow pop-ups to print the quotation.'))
      }
      setItems([])
      setHeader(EMPTY_HEADER)
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const field = (key: keyof QuoteHeader, label: string, type = 'text') => (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={`quote-${key}`}>{label}</Label>
      <Input
        id={`quote-${key}`}
        type={type}
        value={header[key]}
        onChange={(event) =>
          setHeader((current) => ({
            ...current,
            [key]:
              type === 'number'
                ? Number.parseFloat(event.target.value) || 0
                : event.target.value,
          }))
        }
      />
    </div>
  )

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Quotations')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          size='sm'
          onClick={() => void handleGenerate()}
          disabled={isSubmitting}
        >
          <FileText className='h-4 w-4' />
          {isSubmitting ? t('Generating...') : t('Generate quotation')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex flex-col gap-6'>
          <div className='grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Customer')}</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-4'>
                {field('customer_name', t('Customer name'))}
                {field('customer_contact', t('Contact Name'))}
                {field('customer_email', t('Contact Email'))}
                <div className='grid grid-cols-2 gap-4'>
                  {field('discount_percent', t('Global discount %'), 'number')}
                  {field('valid_days', t('Valid for (days)'), 'number')}
                </div>
                <div className='flex flex-col gap-1.5'>
                  <Label htmlFor='quote-notes'>{t('Terms & notes')}</Label>
                  <Textarea
                    id='quote-notes'
                    rows={4}
                    value={header.notes}
                    onChange={(event) =>
                      setHeader((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('Models')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ModelPicker
                  selected={selected}
                  onToggle={toggleModel}
                  group={group}
                  onGroupChange={setGroup}
                />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>
                {t('Quote items ({{count}})', { count: items.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuoteItemsTable
                items={items}
                globalDiscount={header.discount_percent}
                onChange={(modelName, patch) =>
                  setItems((current) =>
                    current.map((item) =>
                      item.model_name === modelName
                        ? { ...item, ...patch }
                        : item
                    )
                  )
                }
                onRemove={(modelName) =>
                  setItems((current) =>
                    current.filter((item) => item.model_name !== modelName)
                  )
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('Quotation history')}</CardTitle>
            </CardHeader>
            <CardContent>
              <QuotesHistory />
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
