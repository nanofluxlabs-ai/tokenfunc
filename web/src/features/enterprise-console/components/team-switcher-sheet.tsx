import { ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import type { Team } from '../types'
import { type TeamSelection, TeamPanel } from './team-panel'

type TeamSwitcherSheetProps = {
  teams: Team[]
  selected: TeamSelection
  onSelect: (selection: TeamSelection) => void
  canManage: boolean
}

/**
 * 手机上的团队切换：顶部一个显示当前团队的按钮，点开从底部弹出完整团队列表。
 * 列表直接复用 TeamPanel，每个团队的管理菜单（改名 / 归档 / 删除）在手机上照样可用；选中即收起。
 */
export function TeamSwitcherSheet(props: TeamSwitcherSheetProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const current =
    props.selected === 'all'
      ? t('All Members')
      : (props.teams.find((team) => team.id === props.selected)?.name ??
        t('Teams'))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant='outline'
            aria-label={t('Switch team')}
            className='w-full justify-between'
          />
        }
      >
        <span className='truncate'>{current}</span>
        <ChevronsUpDown className='size-4 shrink-0 opacity-60' />
      </SheetTrigger>
      <SheetContent side='bottom' className='max-h-[85svh] overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>{t('Teams')}</SheetTitle>
        </SheetHeader>
        <div className='px-4 pb-6'>
          <TeamPanel
            teams={props.teams}
            selected={props.selected}
            showAll
            onSelect={(selection) => {
              props.onSelect(selection)
              setOpen(false)
            }}
            canManage={props.canManage}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
