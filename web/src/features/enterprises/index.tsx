import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { UserTopupDialog } from '@/features/users/components/dialogs/user-topup-dialog'

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
  const { open, setOpen, currentRow, triggerRefresh } = useEnterprises()
  return (
    <>
      <EnterprisesTable />
      {/* 企业主的充值与普通用户同一条路径（订单 / 日志 / 二次验证一致），后端再补企业台账；UsersProvider 由用户页提供 */}
      {currentRow && (
        <UserTopupDialog
          open={open === 'topup'}
          onOpenChange={(isOpen) => !isOpen && setOpen(null)}
          user={{ id: currentRow.user_id, username: currentRow.username }}
          onSuccess={triggerRefresh}
        />
      )}
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
export { BillsAdminContent } from './components/bills-admin-page'
