import { Download, Printer, RefreshCw } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Markdown } from '@/components/ui/markdown'
import dayjs from '@/lib/dayjs'
import { handleServerError } from '@/lib/handle-server-error'

import { renderQuote } from '../api'
import {
  buildQuoteStandaloneHtml,
  downloadTextFile,
  openQuotePrintPreview,
  quoteFileName,
  renderQuoteMarkdownToHtml,
} from '../lib/quote-export'
import type { QuoteConfig, RenderQuoteResponse } from '../types'

type GenerateTabProps = {
  config: QuoteConfig
}

/** 折扣（按分组）/ 汇率 / 有效期 / 生成日期 → 后端渲染 Markdown → 预览与导出 */
export function GenerateTab(props: GenerateTabProps) {
  const { t } = useTranslation()
  const groups = useMemo(
    () => [...props.config.groups].sort((a, b) => a.order - b.order),
    [props.config.groups]
  )
  const [discounts, setDiscounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.default_discount]))
  )
  const [exchangeRate, setExchangeRate] = useState(
    props.config.meta.default_exchange_rate
  )
  const [validityDays, setValidityDays] = useState(
    props.config.meta.default_validity_days
  )
  const [generatedDate, setGeneratedDate] = useState(() =>
    dayjs().format('YYYY-MM-DD')
  )
  const [result, setResult] = useState<RenderQuoteResponse | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const response = await renderQuote({
        discounts,
        exchange_rate: exchangeRate,
        validity_days: validityDays,
        generated_date: generatedDate,
      })
      if (!response.success || !response.data) {
        handleServerError(response)
        return
      }
      setResult(response.data)
      toast.success(t('Quote generated'))
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsGenerating(false)
    }
  }

  const brand = props.config.meta.brand_name
  const handleDownloadMarkdown = () => {
    if (!result) return
    downloadTextFile(
      quoteFileName(brand, result.generated_date, 'md'),
      result.markdown,
      'text/markdown;charset=utf-8'
    )
  }
  const handleDownloadHtml = () => {
    if (!result) return
    downloadTextFile(
      quoteFileName(brand, result.generated_date, 'html'),
      buildQuoteStandaloneHtml(renderQuoteMarkdownToHtml(result.markdown)),
      'text/html;charset=utf-8'
    )
  }
  const handlePrint = () => {
    if (!result) return
    const html = buildQuoteStandaloneHtml(
      renderQuoteMarkdownToHtml(result.markdown)
    )
    if (!openQuotePrintPreview(html)) {
      toast.error(t('Please allow pop-ups to print the quotation.'))
    }
  }

  const numberField = (
    id: string,
    label: string,
    value: number,
    onChange: (value: number) => void,
    attrs: { min: number; max: number; step: number },
    hint?: string
  ) => (
    <div className='flex flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type='number'
        value={value}
        min={attrs.min}
        max={attrs.max}
        step={attrs.step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <p className='text-muted-foreground text-xs'>{hint}</p> : null}
    </div>
  )

  return (
    <div className='flex flex-col gap-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Quote parameters')}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {groups.map((group) => (
              <Fragment key={group.key}>
                {numberField(
                  `quote-discount-${group.key}`,
                  t('{{name}} discount (%)', {
                    name: group.short_name || group.name,
                  }),
                  discounts[group.key] ?? group.default_discount,
                  (value) =>
                    setDiscounts((current) => ({
                      ...current,
                      [group.key]: value,
                    })),
                  { min: 1, max: 100, step: 1 },
                  t('Default {{d}}%, meaning official price × {{d}}%', {
                    d: group.default_discount,
                  })
                )}
              </Fragment>
            ))}
            {numberField(
              'quote-exchange-rate',
              t('Exchange rate USD→CNY'),
              exchangeRate,
              setExchangeRate,
              { min: 1, max: 20, step: 0.01 }
            )}
            {numberField(
              'quote-validity-days',
              t('Valid for (days)'),
              validityDays,
              setValidityDays,
              { min: 1, max: 365, step: 1 }
            )}
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='quote-generated-date'>
                {t('Generated date')}
              </Label>
              <Input
                id='quote-generated-date'
                type='date'
                value={generatedDate}
                onChange={(event) => setGeneratedDate(event.target.value)}
              />
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
            >
              <RefreshCw className='h-4 w-4' />
              {isGenerating ? t('Generating...') : t('Generate / regenerate')}
            </Button>
            <Button
              variant='outline'
              disabled={!result}
              onClick={handleDownloadMarkdown}
            >
              <Download className='h-4 w-4' />
              {t('Download Markdown')}
            </Button>
            <Button
              variant='outline'
              disabled={!result}
              onClick={handleDownloadHtml}
            >
              <Download className='h-4 w-4' />
              {t('Download HTML')}
            </Button>
            <Button
              variant='secondary'
              disabled={!result}
              onClick={handlePrint}
            >
              <Printer className='h-4 w-4' />
              {t('Print / Save PDF')}
            </Button>
          </div>
          {result ? (
            <Alert>
              <AlertDescription>
                {t('Generated on {{g}}, valid until {{e}}', {
                  g: result.generated_date,
                  e: result.expiry_date,
                })}
              </AlertDescription>
            </Alert>
          ) : null}
          <Alert>
            <AlertDescription>
              {t(
                'To export a PDF: click "Print / Save PDF", choose "Save as PDF" as the destination, and untick "Headers and footers" under more settings (the browser remembers this).'
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Preview')}</CardTitle>
        </CardHeader>
        <CardContent>
          {result ? (
            <Markdown breaks className='tf-quote-preview'>
              {result.markdown}
            </Markdown>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('Click "Generate" to preview the quote here.')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
