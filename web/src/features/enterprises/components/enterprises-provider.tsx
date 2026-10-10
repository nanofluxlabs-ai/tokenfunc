import React, { useState } from 'react'

import useDialogState from '@/hooks/use-dialog'

import type { EnterpriseListItem, EnterprisesDialogType } from '../types'

type EnterprisesContextType = {
  open: EnterprisesDialogType | null
  setOpen: (value: EnterprisesDialogType | null) => void
  currentRow: EnterpriseListItem | null
  setCurrentRow: React.Dispatch<React.SetStateAction<EnterpriseListItem | null>>
  refreshTrigger: number
  triggerRefresh: () => void
}

const EnterprisesContext = React.createContext<EnterprisesContextType | null>(
  null
)

export function EnterprisesProvider(props: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<EnterprisesDialogType>(null)
  const [currentRow, setCurrentRow] = useState<EnterpriseListItem | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1)

  return (
    <EnterprisesContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        refreshTrigger,
        triggerRefresh,
      }}
    >
      {props.children}
    </EnterprisesContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useEnterprises = () => {
  const context = React.useContext(EnterprisesContext)
  if (!context) {
    throw new Error(
      'useEnterprises has to be used within <EnterprisesProvider>'
    )
  }
  return context
}
