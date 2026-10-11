import { Link } from '@tanstack/react-router'

import { BillsAdminContent } from '@/features/enterprises'

import { formatBillRef } from '../../lib/bill-ref'
import { OpenPeriodsTable } from './open-periods-table'

/** 企业账单 tab：进行中账期（实时）+ 已出账账单（账单号可点进详情） */
export function BillsPanel() {
  return (
    <div className='flex flex-col gap-4'>
      <OpenPeriodsTable />
      <BillsAdminContent
        renderBillNo={(bill) => (
          <Link
            to='/finance/bills/$billId'
            params={{ billId: formatBillRef({ kind: 'bill', id: bill.id }) }}
            className='text-primary hover:underline'
          >
            {bill.bill_no}
          </Link>
        )}
      />
    </div>
  )
}
