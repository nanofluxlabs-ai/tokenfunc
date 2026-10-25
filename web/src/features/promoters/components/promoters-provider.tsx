import React, { useState } from 'react'

import useDialogState from '@/hooks/use-dialog'

import type { PromoterListItem, PromotersDialogType } from '../types'

type PromotersContextType = {
  open: PromotersDialogType | null
  setOpen: (value: PromotersDialogType | null) => void
  currentRow: PromoterListItem | null
  setCurrentRow: React.Dispatch<React.SetStateAction<PromoterListItem | null>>
  refreshTrigger: number
  triggerRefresh: () => void
}

const PromotersContext = React.createContext<PromotersContextType | null>(null)

export function PromotersProvider(props: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<PromotersDialogType>(null)
  const [currentRow, setCurrentRow] = useState<PromoterListItem | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1)
  return (
    <PromotersContext
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
    </PromotersContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePromoters = () => {
  const context = React.useContext(PromotersContext)
  if (!context) {
    throw new Error('usePromoters has to be used within <PromotersProvider>')
  }
  return context
}
