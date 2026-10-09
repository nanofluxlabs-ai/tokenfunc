import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { EnterpriseBillingDrawer } from './components/enterprise-billing-drawer'
import { EnterpriseMutateDrawer } from './components/enterprise-mutate-drawer'
import {
  EnterprisesProvider,
  useEnterprises,
} from './components/enterprises-provider'
import { EnterprisesTable } from './components/enterprises-table'

export function EnterprisesPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow } = useEnterprises()
  return (
    <Button
      size='sm'
      onClick={() => {
        setCurrentRow(null)
        setOpen('create')
      }}
    >
      <Plus className='h-4 w-4' />
      {t('Add Enterprise')}
    </Button>
  )
}

export function EnterprisesPanel() {
  const { open, setOpen, currentRow } = useEnterprises()
  return (
    <>
      <EnterprisesTable />
      <EnterpriseMutateDrawer
        open={open === 'create' || open === 'update'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={open === 'update' ? currentRow || undefined : undefined}
      />
      <EnterpriseBillingDrawer
        open={open === 'billing'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={open === 'billing' ? currentRow || undefined : undefined}
      />
    </>
  )
}

export { EnterprisesProvider }
export { EnterpriseBillsAdmin } from './components/bills-admin-page'
