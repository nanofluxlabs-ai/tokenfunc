// TokenFunc 二开：「配置渠道分组」按钮 + 弹窗：从已有渠道分组里挑一个配给当前用户分组。
// 候选 = 定价草稿里当前不可见的渠道分组；确认后把该行置为可见、带上填写的倍率追加到草稿末尾，
// 不立即保存：系统设置页由右上角「保存」统一提交，定价抽屉由抽屉底部「保存」提交。
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { translateServerText } from '@/lib/server-error-message'

import { parseRatioText, type PricingRowView } from '../lib/user-group-pricing'

type AddChannelGroupButtonProps = {
  rows: PricingRowView[]
  onChange: (rows: PricingRowView[]) => void
  disabled?: boolean
  className?: string
}

export function AddChannelGroupButton(props: AddChannelGroupButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [groupKey, setGroupKey] = useState<string | null>(null)
  const [ratioText, setRatioText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const hiddenRows = props.rows.filter((row) => !row.visible)
  const candidates = hiddenRows.map((row) => ({
    value: row.channel_group,
    label: translateServerText(t, row.label) || row.channel_group,
    description: `${row.channel_group} · ${row.base_ratio}x`,
  }))
  const selected = hiddenRows.find((row) => row.channel_group === groupKey)
  const ratioInvalid =
    ratioText.trim() !== '' && parseRatioText(ratioText) === null
  const nothingToAdd = candidates.length === 0

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) return
    setGroupKey(null)
    setRatioText('')
    setSubmitted(false)
  }

  const handleAdd = () => {
    setSubmitted(true)
    if (!selected || ratioInvalid) return
    // 新行追加到可见列表末尾，顺序由用户再调整
    props.onChange([
      ...props.rows.filter((row) => row.visible),
      { ...selected, visible: true, ratioText: ratioText.trim() },
      ...hiddenRows.filter(
        (row) => row.channel_group !== selected.channel_group
      ),
    ])
    handleOpenChange(false)
  }

  const button = (
    <Button
      type='button'
      size='sm'
      variant='outline'
      className={props.className}
      disabled={props.disabled || nothingToAdd}
      onClick={() => handleOpenChange(true)}
    >
      <Plus className='size-4' aria-hidden='true' />
      {t('Configure channel group')}
    </Button>
  )

  return (
    <>
      {nothingToAdd ? (
        <Tooltip>
          <TooltipTrigger render={<span className='inline-flex' />}>
            {button}
          </TooltipTrigger>
          <TooltipContent>
            {t('All channel groups are already listed')}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title={t('Configure channel group')}
        description={t(
          'Pick a channel group to offer to this user group. Leave the ratio empty to use its base ratio.'
        )}
        contentClassName='sm:max-w-md'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => handleOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='button' onClick={handleAdd}>
              {t('Add')}
            </Button>
          </>
        }
      >
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='add-channel-group-key'>{t('Channel group')}</Label>
            <Combobox
              id='add-channel-group-key'
              options={candidates}
              value={groupKey}
              onValueChange={setGroupKey}
              placeholder={t('Select a channel group')}
              emptyText={t('No matching channel groups')}
              aria-invalid={submitted && !selected ? true : undefined}
              className='w-full'
            />
            {submitted && !selected && (
              <p className='text-destructive text-sm' role='alert'>
                {t('Select a channel group')}
              </p>
            )}
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='add-channel-group-ratio'>{t('Ratio')}</Label>
            <Input
              id='add-channel-group-ratio'
              type='number'
              min={0}
              step={0.01}
              inputMode='decimal'
              value={ratioText}
              placeholder={selected ? String(selected.base_ratio) : ''}
              aria-invalid={ratioInvalid || undefined}
              className='font-mono tabular-nums'
              onChange={(event) => setRatioText(event.target.value)}
            />
            {ratioInvalid && (
              <p className='text-destructive text-sm' role='alert'>
                {t('Ratio must be a number of 0 or more')}
              </p>
            )}
          </div>
        </div>
      </Dialog>
    </>
  )
}
