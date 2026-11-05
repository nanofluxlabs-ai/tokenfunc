// TokenFunc 二开：用户分组页签的弹层状态，与企业页签的 Provider 同一套模式。
import React, { useMemo, useState } from 'react'

import useDialogState from '@/hooks/use-dialog'
import type { UserGroupItem } from '@/lib/tokenfunc-groups'

export type UserGroupsDialogType = 'create' | 'update' | 'pricing' | 'delete'

type UserGroupsContextType = {
  open: UserGroupsDialogType | null
  setOpen: (value: UserGroupsDialogType | null) => void
  currentRow: UserGroupItem | null
  setCurrentRow: React.Dispatch<React.SetStateAction<UserGroupItem | null>>
}

const UserGroupsContext = React.createContext<UserGroupsContextType | null>(
  null
)

export function UserGroupsProvider(props: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<UserGroupsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<UserGroupItem | null>(null)
  const value = useMemo(
    () => ({ open, setOpen, currentRow, setCurrentRow }),
    [open, setOpen, currentRow]
  )
  return <UserGroupsContext value={value}>{props.children}</UserGroupsContext>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useUserGroups = () => {
  const context = React.useContext(UserGroupsContext)
  if (!context) {
    throw new Error('useUserGroups has to be used within <UserGroupsProvider>')
  }
  return context
}
