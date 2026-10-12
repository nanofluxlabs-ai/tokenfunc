import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'

type CreditNoticeProps = { billingMode?: string }

/** 授信企业主：账期账单已在企业控制台出账，这里只给入口，不重复列表 */
export function CreditNotice(props: CreditNoticeProps) {
  const { t } = useTranslation()
  if (props.billingMode !== 'credit') return null
  return (
    <Alert className='bg-muted/40'>
      <AlertDescription className='flex flex-wrap items-center gap-x-2'>
        <span>
          {t(
            'Your enterprise is billed by credit period; issued statements are available in Enterprise Bills.'
          )}
        </span>
        <Link to='/enterprise/bills' className='text-primary underline'>
          {t('Open Enterprise Bills')}
        </Link>
      </AlertDescription>
    </Alert>
  )
}
