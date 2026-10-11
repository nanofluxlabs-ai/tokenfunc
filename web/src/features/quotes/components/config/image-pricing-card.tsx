import { Plus, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { ImagePricingBlock, QuoteConfigEditorProps } from '../../types'
import { OptionSelect } from './option-select'

/**
 * 图片计费附表：按供应商分组各至多一个块（token 计费项 + 按张参考价），
 * 本地草稿编辑，点「保存图片计费」整体落库；分组需开启对应开关才会渲染。
 */
export function ImagePricingCard(props: QuoteConfigEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ImagePricingBlock[] | null>(null)
  const [activeGroup, setActiveGroup] = useState('')
  const [removeOpen, setRemoveOpen] = useState(false)

  const groups = useMemo(
    () => [...props.config.groups].sort((a, b) => a.order - b.order),
    [props.config.groups]
  )
  const blocks = draft ?? props.config.image_pricing
  const groupKey = activeGroup || groups[0]?.key || ''
  const blockIndex = blocks.findIndex((b) => b.group_key === groupKey)
  const block = blockIndex >= 0 ? blocks[blockIndex] : undefined
  const group = groups.find((g) => g.key === groupKey)

  const updateBlock = (patch: Partial<ImagePricingBlock>) => {
    setDraft(blocks.map((b, i) => (i === blockIndex ? { ...b, ...patch } : b)))
  }

  const addBlock = () => {
    setDraft([
      ...blocks,
      {
        group_key: groupKey,
        model_id: '',
        section_title: '',
        token_items: [{ label: '', key: '', price: 0 }],
        per_image_items: [{ quality: '', price: 0 }],
        note: '',
      },
    ])
  }

  const handleSave = async () => {
    const ok = await props.onSave({ ...props.config, image_pricing: blocks })
    if (ok) setDraft(null)
  }

  const removeBlock = () => {
    setDraft(blocks.filter((_, i) => i !== blockIndex))
    setRemoveOpen(false)
  }

  const priceInput = (
    value: number,
    onChange: (value: number) => void,
    step: number,
    label: string
  ) => (
    <Input
      type='number'
      min={0}
      step={step}
      value={value}
      aria-label={label}
      className='w-32'
      onChange={(event) => onChange(Number(event.target.value))}
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Image pricing table')}</CardTitle>
        <CardDescription>
          {t(
            'Configured per vendor group; the group must enable "Render image pricing table" for it to appear in the quote.'
          )}
        </CardDescription>
        <CardAction>
          <Button
            size='sm'
            disabled={!draft || props.saving}
            onClick={() => void handleSave()}
          >
            <Save className='h-4 w-4' />
            {t('Save image pricing')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='quote-image-group'>{t('Vendor group')}</Label>
            <OptionSelect
              id='quote-image-group'
              value={groupKey}
              onChange={setActiveGroup}
              options={groups.map((g) => ({
                value: g.key,
                label: g.short_name || g.name,
              }))}
              className='w-48'
            />
          </div>
          {group && !group.show_image_pricing ? (
            <p className='text-warning text-sm'>
              {t(
                'This group has "Render image pricing table" turned off, so this data will not appear in the quote.'
              )}
            </p>
          ) : null}
        </div>

        {!block ? (
          <div className='flex flex-col items-start gap-2'>
            <p className='text-muted-foreground text-sm'>
              {t('No image pricing for this group yet.')}
            </p>
            <Button variant='outline' size='sm' onClick={addBlock}>
              <Plus className='h-4 w-4' />
              {t('Add image pricing for this group')}
            </Button>
          </div>
        ) : (
          <>
            <div className='flex flex-wrap items-end gap-3'>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='quote-image-model-id'>{t('Model ID')}</Label>
                <Input
                  id='quote-image-model-id'
                  className='w-48'
                  value={block.model_id}
                  onChange={(event) =>
                    updateBlock({ model_id: event.target.value })
                  }
                />
              </div>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='quote-image-section-title'>
                  {t('Section title')}
                </Label>
                <Input
                  id='quote-image-section-title'
                  className='w-72'
                  value={block.section_title}
                  onChange={(event) =>
                    updateBlock({ section_title: event.target.value })
                  }
                />
              </div>
              <Button
                variant='destructive'
                size='sm'
                onClick={() => setRemoveOpen(true)}
              >
                <Trash2 className='h-4 w-4' />
                {t('Remove image pricing for this group')}
              </Button>
            </div>

            <div className='flex flex-col gap-2'>
              <p className='text-sm font-medium'>
                {t('Token pricing (USD / 1M tokens)')}
              </p>
              {block.token_items.map((item, index) => (
                // eslint-disable-next-line react/no-array-index-key -- 可编辑行没有 ID；用索引保持输入框身份，标签与数值可随时改。
                <div key={index} className='flex flex-wrap items-center gap-2'>
                  <Input
                    className='w-72'
                    value={item.label}
                    aria-label={t('Billing item')}
                    onChange={(event) =>
                      updateBlock({
                        token_items: block.token_items.map((it, i) =>
                          i === index
                            ? { ...it, label: event.target.value }
                            : it
                        ),
                      })
                    }
                  />
                  {priceInput(
                    item.price,
                    (value) =>
                      updateBlock({
                        token_items: block.token_items.map((it, i) =>
                          i === index ? { ...it, price: value } : it
                        ),
                      }),
                    0.1,
                    t('Price')
                  )}
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Delete')}
                    onClick={() =>
                      updateBlock({
                        token_items: block.token_items.filter(
                          (_, i) => i !== index
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                variant='outline'
                size='sm'
                className='self-start'
                onClick={() =>
                  updateBlock({
                    token_items: [
                      ...block.token_items,
                      { label: '', key: '', price: 0 },
                    ],
                  })
                }
              >
                <Plus className='h-4 w-4' />
                {t('Add row')}
              </Button>
            </div>

            <div className='flex flex-col gap-2'>
              <p className='text-sm font-medium'>
                {t('Per-image reference price (USD / image)')}
              </p>
              {block.per_image_items.map((item, index) => (
                // eslint-disable-next-line react/no-array-index-key -- 可编辑行没有 ID；用索引保持输入框身份，标签与数值可随时改。
                <div key={index} className='flex flex-wrap items-center gap-2'>
                  <Input
                    className='w-40'
                    value={item.quality}
                    aria-label={t('Quality tier')}
                    onChange={(event) =>
                      updateBlock({
                        per_image_items: block.per_image_items.map((it, i) =>
                          i === index
                            ? { ...it, quality: event.target.value }
                            : it
                        ),
                      })
                    }
                  />
                  {priceInput(
                    item.price,
                    (value) =>
                      updateBlock({
                        per_image_items: block.per_image_items.map((it, i) =>
                          i === index ? { ...it, price: value } : it
                        ),
                      }),
                    0.001,
                    t('Price')
                  )}
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Delete')}
                    onClick={() =>
                      updateBlock({
                        per_image_items: block.per_image_items.filter(
                          (_, i) => i !== index
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                variant='outline'
                size='sm'
                className='self-start'
                onClick={() =>
                  updateBlock({
                    per_image_items: [
                      ...block.per_image_items,
                      { quality: '', price: 0 },
                    ],
                  })
                }
              >
                <Plus className='h-4 w-4' />
                {t('Add row')}
              </Button>
            </div>

            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='quote-image-note'>
                {t('Note below the table')}
              </Label>
              <Input
                id='quote-image-note'
                value={block.note}
                onChange={(event) => updateBlock({ note: event.target.value })}
              />
            </div>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t('Remove image pricing for this group?')}
        desc={t('The change is applied after you click "Save image pricing".')}
        destructive
        confirmText={t('Remove')}
        handleConfirm={removeBlock}
      />
    </Card>
  )
}
