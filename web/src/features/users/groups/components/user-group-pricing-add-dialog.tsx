// TokenFunc 二开：「配置渠道分组」按钮 + 弹窗：从已有渠道分组里挑一个或多个配给当前用户分组。
// 候选 = 定价草稿里当前不可见的渠道分组；确认后把选中的行置为可见、带上同一个倍率、按候选顺序追加到草稿末尾，
// 不立即保存：系统设置页由右上角「保存」统一提交，定价抽屉由抽屉底部「保存」提交。
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
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
  const [groupKeys, setGroupKeys] = useState<string[]>([])
  const [ratioText, setRatioText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const hiddenRows = props.rows.filter((row) => !row.visible)
  const candidates = hiddenRows.map((row) => ({
    value: row.channel_group,
    label: translateServerText(t, row.label) || row.channel_group,
    hint: `${row.channel_group} · ${row.base_ratio}x`,
    title: row.channel_group,
  }))
  // 按候选顺序（即注册表顺序）取选中的行，追加时保持这个顺序
  const selectedRows = hiddenRows.filter((row) =>
    groupKeys.includes(row.channel_group)
  )
  const ratioInvalid =
    ratioText.trim() !== '' && parseRatioText(ratioText) === null
  const nothingToAdd = candidates.length === 0
  // 只选了一个时提示它的基准价；多选各自基准价不同，不提示
  const ratioPlaceholder =
    selectedRows.length === 1 ? String(selectedRows[0].base_ratio) : ''

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) return
    setGroupKeys([])
    setRatioText('')
    setSubmitted(false)
  }

  const handleAdd = () => {
    setSubmitted(true)
    if (selectedRows.length === 0 || ratioInvalid) return
    // 新行追加到可见列表末尾，顺序由用户再调整
    const ratio = ratioText.trim()
    props.onChange([
      ...props.rows.filter((row) => row.visible),
      ...selectedRows.map((row) => ({ ...row, visible: true, ratioText: ratio })),
      ...hiddenRows.filter((row) => !groupKeys.includes(row.channel_group)),
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
          "Pick one or more channel groups to offer to this user group. The ratio applies to all of them; leave it empty to use each group's base ratio."
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
            <Label htmlFor='add-channel-group-keys'>{t('Channel groups')}</Label>
            <MultiSelect
              id='add-channel-group-keys'
              options={candidates}
              selected={groupKeys}
              onChange={setGroupKeys}
              placeholder={t('Select channel groups')}
              emptyText={t('No matching channel groups')}
              maxVisibleChips={8}
              className='w-full'
            />
            {submitted && selectedRows.length === 0 && (
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
              placeholder={ratioPlaceholder}
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
